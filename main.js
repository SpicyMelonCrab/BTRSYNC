const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.mondaySyncInterval = null;
	}

	async init(config) {
		this.config = config
	
		this.updateStatus(InstanceStatus.Ok)
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions
	
		// SET DEFAULT VARIABLES ON FIRST RUN
		this.setVariableValues({
			'current_presentation_file_path' : 'Unknown',
			'allow-demo-p': 'Unknown',
			'allow-demo-c': 'Unknown',
			'allow-demo-n': 'Unknown',
			'allow-record-p': 'Unknown',
			'allow-record-c': 'Unknown',
			'allow-record-n': 'Unknown',
			'allow-stream-p': 'Unknown',
			'allow-stream-c': 'Unknown',
			'allow-stream-n': 'Unknown',
			'stream-address-p': 'Unknown',
			'stream-address-c': 'Unknown',
			'stream-address-n': 'Unknown',
			'board-sync-status': 'Unsynced',
			'last-board-sync': 'Never',
			'current-presentation-completion-percent': '0',
			'presentation-name-c': 'Unknown',
			'presentation-presenter-c': 'Unknown',
			'presentation-timeslot-c': '0',
			'presentation-name-p': 'Unknown',
			'presentation-presenter-p': 'Unknown',
			'presentation-timeslot-p': '0',
			'presentation-name-n': 'Unknown',
			'presentation-presenter-n': 'Unknown',
			'presentation-timeslot-n': '0',
			'synced-project-overview-item-id': 'Unknown',
			'synced-room-info-board' : 'unknown',
			'synced-presentation-management-board': 'unknown',
			'my-room': "Unknown"
		});
		
		 // Collect information on all Kits.
		 await this.getKits();

    	this.repeatingBoardQuery = setInterval(() => this.findSyncedProjectOverview(), 10000); // Sets 'synced-project-overview-item-id' 
	}
	
	async destroy() {
		this.log('debug', 'destroy')
	
		// Clear the interval when the instance is destroyed
		if (this.repeatingBoardQuery) {
			clearInterval(this.repeatingBoardQuery);
		}
		if (this.mondaySyncInterval) { // Ensure it's cleared
			clearInterval(this.mondaySyncInterval);
		}
	}
	

	async configUpdated(config) {
		this.config = config;
	
		// Stop any existing syncing process
		if (this.syncingProcessInterval) {
			clearInterval(this.syncingProcessInterval);
			this.syncingProcessInterval = null;
		}
	
		// Restart finding synced project
		if (!this.lastSyncedProjectId) {
			await this.getKits();
			this.repeatingBoardQuery = setInterval(() => this.findSyncedProjectOverview(), 10000);
		} else {
			this.log('info', `Skipping re-initialization since project is already synced: ${this.lastSyncedProjectId}`);
			
			// Restart syncing process
			this.startSyncingProcess();
		}
	}
	
	
	
	
	

	async queryMondayBoard(boardId) {
		const mondayApiToken = this.config['monday-api-token'];
	
		if (!mondayApiToken) {
			this.log('error', 'Monday API Token is not set. Cannot query board.');
			return;
		}
	
		try {
			const response = await fetch('https://api.monday.com/v2', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': mondayApiToken
				},
				body: JSON.stringify({
					query: `
						query {
							boards(ids: [${boardId}]) {
								id
								name
								columns {
									id
									title
								}
								items_page(limit: 100) {
									items {
										id
										name
										column_values {
											id
											text
											value
										}
									}
								}
							}
						}
					`
				})
			});
	
			const result = await response.json();
	
			if (result.errors) {
				this.log('error', `Error querying board ${boardId}: ${result.errors[0].message}`);
				return;
			}
	
			const board = result.data.boards[0];
	
			if (board) {
				this.log('info', `Board Retrieved: ${board.name} (ID: ${board.id})`);
	
				// Create a mapping of column IDs to column titles
				const columnMap = {};
				board.columns.forEach(col => {
					columnMap[col.id] = col.title;
				});
	
				// Format item data
				const items = board.items_page.items.map(item => ({
					id: item.id,
					name: item.name,
					fields: item.column_values.map(col => ({
						id: col.id,
						title: columnMap[col.id] || col.id, // Get title from column map
						text: col.text || 'N/A', // Human-readable value
						raw_value: col.value || 'N/A' // Raw JSON value
					}))
				}));
	
				//this.log('info', `Items: ${JSON.stringify(items, null, 2)}`);
	
				return items; // Return structured data
			} else {
				this.log('warn', `No board found with ID ${boardId}`);
			}
	
		} catch (error) {
			this.log('error', `Error querying Monday board: ${error.message}`);
		}
	}

	async queryMondayItem(itemId) {
		const mondayApiToken = this.config['monday-api-token'];
	
		if (!mondayApiToken) {
			this.log('error', 'Monday API Token is not set. Cannot query item.');
			return;
		}
	
		try {
			const response = await fetch('https://api.monday.com/v2', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': mondayApiToken
				},
				body: JSON.stringify({
					query: `
						query {
							items(ids: [${itemId}]) {
								id
								name
								column_values {
									id
									text
									value
								}
							}
						}
					`
				})
			});
	
			const result = await response.json();
	
			if (result.errors) {
				this.log('error', `Error querying item ${itemId}: ${result.errors[0].message}`);
				return;
			}
	
			const item = result.data.items[0];
	
			if (item) {
				this.log('info', `Item Retrieved: ${item.name} (ID: ${item.id})`);
	
				// Format item data
				const itemData = {
					id: item.id,
					name: item.name,
					fields: item.column_values.map(col => ({
						id: col.id,
						title: col.id, // Column ID as title (Monday API does not return column titles here)
						text: col.text || 'N/A', // Human-readable value
						raw_value: col.value || 'N/A' // Raw JSON value
					}))
				};
	
				//this.log('info', `Item Data: ${JSON.stringify(itemData, null, 2)}`);
	
				return itemData; // Return structured item data
			} else {
				this.log('warn', `No item found with ID ${itemId}`);
			}
	
		} catch (error) {
			this.log('error', `Error querying Monday item: ${error.message}`);
		}
	}
	
	// Return config fields for web config
	getConfigFields() {
		const hasApiKey = this.config && this.config['monday-api-token'];

		return [
			{
				id: 'monday-api-token',
				type: 'textinput',
				label: 'Monday API Token',
				width: 12,
				'default': undefined
			},
			{
				id: 'polling-rate-minutes',
				type: 'number',
				label: 'Polling Rate (Minutes)',
				default: 30,
				width: 6,
				min: 1,
				max: 360
			},
			{
				id: 'kit-warning',
				type: 'static-text',
				width:12,
				label: 'Kit Sync',
				value: hasApiKey
					? 'Kit can be selected' 
					: 'You. must sync the config panel before selecting a Kit. Input a valid API key, then SAVE, and click on the module connection in the left panel.'
			},
			{
				id: 'kit-selection',
				type: 'dropdown',
				label: 'Select a Kit',
				choices: this.kitsDropdown || [], // Use retrieved kits
				width: 12,
				default: undefined
			},
		];
	}

	async getKits() {
		const boardID = "7926688621"; // Hardcoded board ID
	
		this.log('info', `Fetching all items from Board ID: ${boardID}`);
	
		const boardData = await this.queryMondayBoard(boardID);
	
		if (!boardData || boardData.length === 0) {
			this.log('warn', `No items found on Board ID: ${boardID}`);
			this.kitsDropdown = []; // Ensure it's at least an empty array
			return null;
		}
	
		// Extract necessary fields for dropdown options
		this.kitsDropdown = boardData.map(item => ({
			id: item.id,
			label: item.name,
			value: item.id
		}));
	
		//this.log('info', `Kits extracted: ${JSON.stringify(this.kitsDropdown)}`);
		return this.kitsDropdown;
	}

	async findSyncedProjectOverview() {
		// ✅ If we've already found a synced project, stop running
		if (this.lastSyncedProjectId) {
			this.log('info', `Skipping redundant query. Last synced project: ${this.lastSyncedProjectId}`);
			return this.lastSyncedProjectId;
		}
	
		const selectedKit = this.config['kit-selection'];
		if (!selectedKit) {
			this.log('warn', 'No kit is selected. Cannot find synced project overview.');
			return null;
		}
	
		const projectsBoardId = 7885126203; // Board containing projects
	
		try {
			// Step 2: Query all projects on the projects board
			const projects = await this.queryMondayBoard(projectsBoardId);
			if (!projects || projects.length === 0) {
				this.log('warn', 'No projects found on the projects board.');
				return null;
			}
	
			// Step 3: Iterate through projects and check for 'Project Board ID'
			for (const project of projects) {
				const projectBoardIdField = project.fields.find(field => field.id === 'text_mkn1gxxq'); //PROJECT OVERVIEW BOARD ID
	
				if (projectBoardIdField && projectBoardIdField.text && projectBoardIdField.text !== "N/A") {
					const projectBoardId = projectBoardIdField.text.trim();
	
					if (!isNaN(projectBoardId)) {
						// Step 4: Query the first item on the found project board
						const projectItems = await this.queryMondayBoard(projectBoardId);
						if (projectItems && projectItems.length > 0) {
							this.log('info', `Found first item on board ${projectBoardId}: ${projectItems[0].id}`);
	
							// Query the first item itself
							const itemDetails = await this.queryMondayItem(projectItems[0].id);
	
							if (!itemDetails) {
								this.log('warn', `No details retrieved for item ID ${projectItems[0].id}`);
								return null;
							}
	
							// ✅ Check if status_mkmwnf9d is "Syncing"
							const syncStatusField = itemDetails.fields.find(field => field.id === 'status_mkmwnf9d');
							if (!syncStatusField || syncStatusField.text !== "Syncing") {
								this.log('warn', `Project ${itemDetails.id} is not in 'Syncing' state. Status: '${syncStatusField ? syncStatusField.text : 'N/A'}'. Skipping.`);
								return null; // ❌ Do not proceed
							}

							// ✅ Log raw values of all fields in itemDetails
							//this.log('info', `Raw Values of itemDetails: ${JSON.stringify(itemDetails.fields.map(f => ({ id: f.id, title: f.title, raw_value: f.raw_value })), null, 2)}`);
							// ✅ Extract relevant IDs from itemDetails
							const tempVariables = {
								'presentation-mngr-id': null,
								'dashboard-id': null,
								'project-id': null,
								'help-requests-id': null,
								'room-info-id': null,
								'project-logistics-id': null
							};

							// ✅ Map field IDs to variable names
							const fieldMappings = {
								'text_mkmnf1qw': 'presentation-mngr-id',
								'text_mkmnbbe0': 'dashboard-id',
								'text_mkmvqye8': 'project-id',
								'text_mkmnbyjx': 'help-requests-id',
								'text_mkmntkc7': 'room-info-id',
								'text_mkmn3pq2': 'project-logistics-id'
							};

							// ✅ Extract values and store them in tempVariables
							itemDetails.fields.forEach(field => {
								if (fieldMappings[field.id] && field.raw_value !== "N/A") {
									tempVariables[fieldMappings[field.id]] = field.raw_value.replace(/"/g, ''); // Remove extra quotes
								}
							});

							// ✅ Log extracted values for debugging
							//this.log('info', `Temporary Stored Variables: ${JSON.stringify(tempVariables, null, 2)}`);

							// ✅ Now we can reference `tempVariables` throughout the method as needed.

							// Extract 'text_mkmntkc7' field (Room Info Board ID)
							const roomInfoField = itemDetails.fields.find(field => field.id === 'text_mkmntkc7');
	
							if (roomInfoField) {
								const roomInfoBoard = roomInfoField.text || 'Unknown';
								this.setVariableValues({ 'synced-room-info-board': roomInfoBoard });
	
								this.log('info', `Room Info Board Identified: ${roomInfoBoard}`);
	
								// Query the Room Info Board
								if (!isNaN(roomInfoBoard) && roomInfoBoard.trim() !== '') {
									this.log('info', `Querying Room Info Board (ID: ${roomInfoBoard})...`);
									const roomBoardItems = await this.queryMondayBoard(roomInfoBoard);
	
									if (!roomBoardItems || roomBoardItems.length === 0) {
										this.log('warn', `No items found on Room Info Board (ID: ${roomInfoBoard}).`);
										return null;
									}
	
									// ✅ Collect 'Kit Assigned' values
									let kitAssignedValues = [];
									let matchedRoomId = null;  // ✅ Store the matched room ID
									this.log('info', `Room Board Items Retrieved: ${JSON.stringify(roomBoardItems, null, 2)}`);

									roomBoardItems.forEach((item) => {
										const kitAssignedField = item.fields.find(field => field.id === "connect_boards_mkn2a222");
	
										if (kitAssignedField) {
											try {
												const rawData = JSON.parse(kitAssignedField.raw_value);
												if (rawData.linkedPulseIds && rawData.linkedPulseIds.length > 0) {
													const linkedKitIds = rawData.linkedPulseIds.map(link => link.linkedPulseId);
													kitAssignedValues.push(...linkedKitIds);

													// ✅ Check if any linked Kit ID matches the selected kit
													if (linkedKitIds.includes(parseInt(selectedKit))) {
														matchedRoomId = item.id; // ✅ Store the matched room ID
									
														// ✅ Log the matched Room ID
														this.log('info', `Matched Room Found! Room ID: ${matchedRoomId} for Kit: ${selectedKit}`);
													}

												}
											} catch (error) {
												this.log('error', `Error parsing 'Kit Assigned' for item ${item.id}: ${error.message}`);
											}
										}
									});
	
									// ✅ Log the collected 'Kit Assigned' values
									this.log('info', `Collected 'Kit Assigned' values: ${kitAssignedValues.join(", ")}`);
	
									// ✅ Check if any of the collected Kit IDs match the selected Kit
									const matchingKit = kitAssignedValues.find(kitId => kitId.toString() === selectedKit.toString());
	
									if (matchingKit) {
										const matchedProjectId = projectItems[0].id;
									
										// ✅ Store the matched project ID and related board IDs
										this.setVariableValues({
											'synced-project-overview-item-id': matchedProjectId,
											'synced-room-info-board': tempVariables['room-info-id'], // ✅ Set to Room Info Board ID
											'synced-presentation-management-board': tempVariables['presentation-mngr-id'], // ✅ Set to Presentation Manager ID
											'my-room': matchedRoomId || 'Unknown' // ✅ Store the matched Room ID
										});

										// ✅ Log when `my-room` is assigned
										this.log('info', `Assigned Room ID to my-room: ${matchedRoomId}`);


										this.lastSyncedProjectId = matchedProjectId;
									
										this.log('info', `Match found! Kit ${matchingKit} is assigned to project ${matchedProjectId}.`);
										this.log('info', `synced-room-info-board set to: ${tempVariables['room-info-id']}`);
										this.log('info', `synced-presentation-management-board set to: ${tempVariables['presentation-mngr-id']}`);
									
										// ✅ Stop running future queries
										if (this.repeatingBoardQuery) {
											clearInterval(this.repeatingBoardQuery);
											this.repeatingBoardQuery = null;
											this.log('info', `Stopped further queries after finding a match.`);
										}
									
										// ✅ Start the syncing process
										this.startSyncingProcess();  // <-- ADD THIS LINE
									
										return matchedProjectId; // ✅ Return the matched project item ID
									}else {
										this.log('warn', "No matching Kit Assigned found for the selected kit.");
										return null;
									}
								} else {
									this.log('error', `Invalid Room Info Board ID: '${roomInfoBoard}'. Skipping query.`);
								}
							} else {
								this.log('warn', "Field 'text_mkmntkc7' not found in item details.");
							}
						} else {
							this.log('warn', `No items found on project board ${projectBoardId}`);
						}
					} else {
						this.log('error', `Invalid Project Board ID: ${projectBoardId}`);
					}
				}
			}
	
			this.log('warn', 'No valid projects with a Project Board ID found.');
			return null;
		} catch (error) {
			this.log('error', `Error in findSyncedProjectOverview: ${error.message}`);
			return null;
		}
	}
	
	startSyncingProcess() {
		const projectOverviewId = this.getVariableValue('synced-project-overview-item-id');
		const roomInfoBoardId = this.getVariableValue('synced-room-info-board');
		const presentationManagementBoardId = this.getVariableValue('synced-presentation-management-board');
	
		if (!projectOverviewId || projectOverviewId === 'Unknown') {
			this.log('warn', 'Cannot start syncing process. synced-project-overview-item-id is not set.');
			return;
		}
	
		if (!presentationManagementBoardId || presentationManagementBoardId === 'Unknown') {
			this.log('warn', 'Cannot start syncing process. synced-presentation-management-board is not set.');
			return;
		}
	
		// Clear existing interval if already running
		if (this.syncingProcessInterval) {
			clearInterval(this.syncingProcessInterval);
		}
	
		// Fetch polling rate (convert minutes to milliseconds)
		const pollingRateMinutes = this.config['polling-rate-minutes'] || 1;
		const pollingRateMs = pollingRateMinutes * 60 * 1000;
	
		this.log('info', `Starting syncing process. Polling every ${pollingRateMinutes} minute(s).`);
	
		// Run syncEvent immediately before setting the interval
		this.syncEvent();
	
		// Set interval to call syncEvent at the configured rate
		this.syncingProcessInterval = setInterval(() => {
			this.syncEvent();
		}, pollingRateMs);
	}

	
	async syncEvent() {
		const projectOverviewId = this.getVariableValue('synced-project-overview-item-id');
		const roomInfoBoardId = this.getVariableValue('synced-room-info-board');
		const presentationManagementBoardId = this.getVariableValue('synced-presentation-management-board');
	
		this.log('info', `\nBase Values Seeded:\nproject-overview: ${projectOverviewId}\nroom-info: ${roomInfoBoardId}\npresentation-management: ${presentationManagementBoardId}`);
	
		if (!presentationManagementBoardId || presentationManagementBoardId === 'Unknown') {
			this.log('warn', 'Presentation Management Board ID is not set. Skipping query.');
			return;
		}
	
		try {
			this.log('info', `Querying Presentation Management Board (ID: ${presentationManagementBoardId})...`);
			const presentationBoardItems = await this.queryMondayBoard(presentationManagementBoardId);
			// PRINT OUT ALL PRESENTATION BOARD ITEMS FOR DEBUG PURPOSES
			//this.log('info', `Raw Presentation Board Items: ${JSON.stringify(presentationBoardItems, null, 2)}`);



			if (!presentationBoardItems || presentationBoardItems.length === 0) {
				this.log('warn', `No items found on Presentation Management Board (ID: ${presentationManagementBoardId}).`);
				return;
			}
	
			// Capture the local time
			const now = new Date();
			this.log('info', `Current Time (Local Machine): ${now.toLocaleString()}`);
	
			let previousPresentation = null;
			let currentPresentation = null;
			let nextPresentation = null;
	
			const myRoomId = this.getVariableValue('my-room') || 'Unknown';

			// ✅ Log retrieved `my-room` before filtering
			this.log('info', `Retrieved my-room ID for filtering: ${myRoomId}`);


			// ✅ Get today's date in YYYY-MM-DD format
			const todayDate = new Date().toISOString().split('T')[0];

			this.log('info', `Filtering presentations for Room ID: ${myRoomId} and Date: ${todayDate}`);

			// ✅ Capture and process presentations
			let presentations = presentationBoardItems.map((item) => {
				const startTime = this.parseTime(this.getFieldValue(item.fields, "hour__1"));
				const endTime = this.parseTime(this.getFieldValue(item.fields, "dup__of_start_time__1"));
				const sessionDate = this.getFieldValue(item.fields, "date__1");

				// ✅ Extract the 'Room Info' field (connect_boards_mkn2244w)
				const roomInfoField = item.fields.find(field => field.id === "connect_boards_mkn2244w");

				let linkedRoomId = null;
				if (roomInfoField && roomInfoField.raw_value !== "N/A") {
					try {
						const rawData = JSON.parse(roomInfoField.raw_value);
						if (rawData.linkedPulseIds && rawData.linkedPulseIds.length > 0) {
							linkedRoomId = rawData.linkedPulseIds[0].linkedPulseId; // ✅ Extract the first linked room ID
						}
					} catch (error) {
						this.log('error', `Error parsing Room Info for presentation ${item.id}: ${error.message}`);
					}
				}

				return {
					id: item.id,
					name: item.name,
					presenter: this.getFieldValue(item.fields, "text__1"),
					designation: this.getFieldValue(item.fields, "text9__1"),
					sessionDate,
					startTime,
					endTime,
					roomInfoLinkedId: linkedRoomId, // ✅ Store the linked Room ID for filtering
					allowDemo: this.convertCheckboxValue(this.getFieldValue(item.fields, "checkbox__1")),
					record: this.convertCheckboxValue(this.getFieldValue(item.fields, "dup__of_allow_demo__1")),
					stream: this.convertCheckboxValue(this.getFieldValue(item.fields, "dup__of_allow_records__1")),
					streamAddress: this.getFieldValue(item.fields, "dup__of_notes__1")
				};
			});

			// ✅ Filter presentations to keep only those linked to `my-room`
			presentations = presentations.filter(p => p.roomInfoLinkedId && p.roomInfoLinkedId.toString() === myRoomId.toString());

			// ✅ Filter presentations to only include those happening TODAY
			presentations = presentations.filter(p => p.sessionDate && p.sessionDate === todayDate);

			// ✅ Remove presentations missing start or end times
			presentations = presentations.filter(p => p.startTime && p.endTime);

			// ✅ Sort presentations by start time (earliest first)
			presentations.sort((a, b) => a.startTime - b.startTime);

			// ✅ Log filtered & sorted presentations
			//this.log('info', `Filtered & Sorted Presentations for Today: ${JSON.stringify(presentations, null, 2)}`);

	
			// Assign previous, current, and next presentations
			for (let i = 0; i < presentations.length; i++) {
				const presentation = presentations[i];
	
				if (presentation.startTime <= now && now < presentation.endTime) {
					// Found the current presentation
					currentPresentation = presentation;
					previousPresentation = i > 0 ? presentations[i - 1] : null;
					nextPresentation = i + 1 < presentations.length ? presentations[i + 1] : null;
					break;
				} else if (presentation.startTime > now) {
					// No current presentation found yet, so this is the next
					nextPresentation = presentation;
					previousPresentation = i > 0 ? presentations[i - 1] : null;
					break;
				} else {
					// This presentation already ended, so it becomes the previous one
					previousPresentation = presentation;
				}
			}
	
			// Log identified presentations
			this.log('info', `Previous Presentation: ${previousPresentation ? previousPresentation.name : "None"}`);
			this.log('info', `Current Presentation: ${currentPresentation ? currentPresentation.name : "None"}`);
			this.log('info', `Next Presentation: ${nextPresentation ? nextPresentation.name : "None"}`);
	
			// Calculate completion percentage only for the current presentation
			const completionPercent = currentPresentation
				? this.calculateProgress(currentPresentation.startTime, currentPresentation.endTime)
				: "0";
	
			// Update Companion variables
			this.setVariableValues({
				// Previous Presentation
				'presentation-name-p': previousPresentation ? previousPresentation.name : 'Unknown',
				'presentation-presenter-p': previousPresentation ? previousPresentation.presenter : 'Unknown',
				'presentation-timeslot-p': previousPresentation
					? `${this.formatTime(previousPresentation.startTime)} - ${this.formatTime(previousPresentation.endTime)}`
					: 'Unknown',
				'allow-demo-p': previousPresentation ? previousPresentation.allowDemo : 'Unknown',
				'allow-record-p': previousPresentation ? previousPresentation.record : 'Unknown',
				'allow-stream-p': previousPresentation ? previousPresentation.stream : 'Unknown',
				'stream-address-p': previousPresentation ? previousPresentation.streamAddress : 'Unknown',
	
				// Current Presentation
				'presentation-name-c': currentPresentation ? currentPresentation.name : 'Unknown',
				'presentation-presenter-c': currentPresentation ? currentPresentation.presenter : 'Unknown',
				'presentation-timeslot-c': currentPresentation
					? `${this.formatTime(currentPresentation.startTime)} - ${this.formatTime(currentPresentation.endTime)}`
					: 'Unknown',
				'current-presentation-completion-percent': completionPercent,
				'allow-demo-c': currentPresentation ? currentPresentation.allowDemo : 'Unknown',
				'allow-record-c': currentPresentation ? currentPresentation.record : 'Unknown',
				'allow-stream-c': currentPresentation ? currentPresentation.stream : 'Unknown',
				'stream-address-c': currentPresentation ? currentPresentation.streamAddress : 'Unknown',
	
				// Next Presentation
				'presentation-name-n': nextPresentation ? nextPresentation.name : 'Unknown',
				'presentation-presenter-n': nextPresentation ? nextPresentation.presenter : 'Unknown',
				'presentation-timeslot-n': nextPresentation
					? `${this.formatTime(nextPresentation.startTime)} - ${this.formatTime(nextPresentation.endTime)}`
					: 'Unknown',
				'allow-demo-n': nextPresentation ? nextPresentation.allowDemo : 'Unknown',
				'allow-record-n': nextPresentation ? nextPresentation.record : 'Unknown',
				'allow-stream-n': nextPresentation ? nextPresentation.stream : 'Unknown',
				'stream-address-n': nextPresentation ? nextPresentation.streamAddress : 'Unknown',
	
				// Board Sync Status
				'board-sync-status': 'Synced',
				'last-board-sync': now.toLocaleString()
			});
	
		} catch (error) {
			this.log('error', `Error querying Presentation Management Board: ${error.message}`);
		}
	}
	
	
	
	/**
	 * Converts checkbox values from Monday:
	 * - `"v"` -> `"Yes"`
	 * - `"N/A"` -> `"No"`
	 */
	convertCheckboxValue(value) {
		return value === "v" ? "Yes" : "No";
	}
	
	/**
	 * Helper function to get field value by ID
	 */
	getFieldValue(fields, fieldId) {
		const field = fields.find(f => f.id === fieldId);
		return field ? field.text : "N/A";
	}
	
	/**
	 * Parses time in format "hh:mm AM/PM" and returns a Date object
	 */
	parseTime(timeStr) {
		if (!timeStr || timeStr === "N/A") return null;
		const now = new Date();
		const [time, modifier] = timeStr.split(" ");
		let [hours, minutes] = time.split(":").map(Number);
	
		if (modifier === "PM" && hours !== 12) {
			hours += 12;
		} else if (modifier === "AM" && hours === 12) {
			hours = 0;
		}
	
		now.setHours(hours, minutes, 0, 0);
		return now;
	}
	
	/**
	 * Formats time in "HH:MM AM/PM" format
	 */
	formatTime(date) {
		if (!date) return "Unknown";
		const hours = date.getHours();
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const ampm = hours >= 12 ? "PM" : "AM";
		const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
		return `${formattedHours}:${minutes} ${ampm}`;
	}
	
	/**
	 * Calculates the percentage of completion for the current presentation
	 */
	calculateProgress(startTime, endTime) {
		if (!startTime || !endTime) return "0";
		const now = new Date();
		const totalDuration = endTime - startTime;
		const elapsed = now - startTime;
		return ((elapsed / totalDuration) * 100).toFixed(2);
	}
	
	


	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
