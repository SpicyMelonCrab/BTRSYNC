const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')
const fs = require('fs');
const path = require('path');

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
			'auto-sync' : 'enabled',
			'time-mode' : 'enabled',
			'time-mode-disabled-presentation-position' : '1',
			'current-presentation-actual-start-time' : 'None',
			'current-presentation-actual-duration': 'None',
			'presentation-file-path-p' : 'Unknown',
			'presentation-file-path-c' : 'Unknown',
			'presentation-file-path-n' : 'Unknown',
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
			'last-board-sync': 'Never',
			'synced-room-info-board' : 'unknown',
			'synced-presentation-management-board': 'unknown',
			'my-room': "Unknown",
			'presentation-password-input': ""
		});
		
		 // Collect information on all Kits.
		 await this.getKits();
		 await this.getSpeakerReadies();

    	this.repeatingBoardQuery = setInterval(() => this.findSyncedProjectOverview(), 10000); // Sets 'synced-project-overview-item-id' 
	}
	
	async destroy() {
		this.log('debug', 'destroy')
	
		// Clear the interval when the instance is destroyed
		if (this.repeatingBoardQuery) {
			clearInterval(this.repeatingBoardQuery);
			this.repeatingBoardQuery = null;
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
			await this.getSpeakerReadies();
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
			this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
			this.checkFeedbacks('last_sync_status');
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

			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status}`);
			}
	
			const result = await response.json();
	
			if (result.errors) {
				this.log('error', `Error querying board ${boardId}: ${result.errors[0].message}`);
				this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
				this.checkFeedbacks('last_sync_status');
				return;
			}
	
			const board = result.data.boards[0];
	
			if (board) {
				this.log('info', `Board Retrieved: ${board.name} (ID: ${board.id})`);
	
				const columnMap = {};
				board.columns.forEach(col => {
					columnMap[col.id] = col.title;
				});
	
				const items = board.items_page.items.map(item => ({
					id: item.id,
					name: item.name,
					fields: item.column_values.map(col => ({
						id: col.id,
						title: columnMap[col.id] || col.id,
						text: col.text || 'N/A',
						raw_value: col.value || 'N/A'
					}))
				}));
	
				return items;
			} else {
				this.log('warn', `No board found with ID ${boardId}`);
				this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
			}
	
		} catch (error) {
			this.log('error', `Error querying Monday board: ${error.message}`);
			this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
		}
	}

	async queryMondayItem(itemId) {
		const mondayApiToken = this.config['monday-api-token'];
	
		if (!mondayApiToken) {
			this.log('error', 'Monday API Token is not set. Cannot query item.');
			this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
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
			
			if (!response.ok) {
				throw new Error(`HTTP error! Status: ${response.status}`);
			}

			const result = await response.json();
	
			if (result.errors) {
				this.log('error', `Error querying item ${itemId}: ${result.errors[0].message}`);
				this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
				return;
			}
	
			const item = result.data.items[0];
	
			if (item) {
				this.log('info', `Item Retrieved: ${item.name} (ID: ${item.id})`);
	
				const itemData = {
					id: item.id,
					name: item.name,
					fields: item.column_values.map(col => ({
						id: col.id,
						title: col.id,
						text: col.text || 'N/A',
						raw_value: col.value || 'N/A'
					}))
				};
	
				return itemData;
			} else {
				this.log('warn', `No item found with ID ${itemId}`);
				this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
			}
	
		} catch (error) {
			this.log('error', `Error querying Monday item: ${error.message}`);
			this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
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
				id: 'completion-percent-threshold',
				type: 'number',
				label: 'Completion Percent Threshold',
				default: 35,
				width: 12,
				min: 10,
				max: 100
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
					? 'Kit/Speaker Ready can be selected' 
					: 'You. must sync the config panel before selecting a Kit. Input a valid API key, then SAVE, and click on the module connection in the left panel.'
			},
			{
				id: 'terminal-type',
				type: 'dropdown',
				label: 'Terminal Type',
				choices: [
					{ id: 'type-kit', label: 'ECS Lite' },
					{ id: 'type-speaker-ready', label: 'Speaker Ready' },
				],
				default: 'type-kit'
			},
			{
				id: 'kit-selection',
				type: 'dropdown',
				label: 'Select a Kit',
				choices: this.kitsDropdown || [], // Use retrieved kits
				width: 12,
				default: undefined
			},
			{
				id: 'speaker-ready-selection',
				type: 'dropdown',
				label: 'Select a Speaker Ready',
				choices: this.speakerReadyDropdown || [], // Use retrieved kits
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

	async getSpeakerReadies() {
		const boardID = "8352032319"; // Hardcoded board ID
	
		this.log('info', `Fetching all items from Board ID: ${boardID}`);
	
		const boardData = await this.queryMondayBoard(boardID);
	
		if (!boardData || boardData.length === 0) {
			this.log('warn', `No items found on Board ID: ${boardID}`);
			this.speakerReadyDropdown = []; // Ensure it's at least an empty array
			return null;
		}
	
		// Extract necessary fields for dropdown options
		this.speakerReadyDropdown = boardData.map(item => ({
			id: item.id,
			label: item.name,
			value: item.id
		}));
	
		//this.log('info', `Kits extracted: ${JSON.stringify(this.kitsDropdown)}`);
		return this.speakerReadyDropdown;
	}

	async findSyncedProjectOverview() {
		// ✅ If we've already found a synced project, stop running
		if (this.lastSyncedProjectId) {
			this.log('info', `Skipping redundant query. Last synced project: ${this.lastSyncedProjectId}`);
			return this.lastSyncedProjectId;
		}
	
		const terminalType = this.config['terminal-type'];
		const selectedKit = this.config['kit-selection'];
		const selectedSpeakerReady = this.config['speaker-ready-selection'];
 
		this.log('info', `Type Check:`);

		if (terminalType == 'type-kit'){
			if (!selectedKit) {
				this.log('warn', 'No kit is selected. Cannot find synced project overview.');
				return null;
			}
			this.log('info', `Type Kit`);
		}
		if (terminalType == 'type-speaker-ready'){
			if (!selectedSpeakerReady) {
				this.log('warn', 'No SR is selected. Cannot find synced project overview.');
				return null;
			}
			this.log('info', `Type Speaker Ready`);
		}
	
		const projectsBoardId = 7885126203; // Board containing projects
	
		try {
			// Step 2: Query all projects on the projects board
			const projects = await this.queryMondayBoard(projectsBoardId);
			if (!projects || projects.length === 0) {
				this.log('warn', 'No projects found on the projects board.');
				this.log('warn', "⚠️ API call failed. Switching to offlineSyncEvent.");
				if (!fs.existsSync('/var/lib/BitCompanionSync/presentation_sync_data.json')) {
					this.log('warn', 'No offline data found. Skipping offline sync.');
					return;
				}
				await this.offlineSyncEvent();
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
	
									// KITS ONLY
									if (terminalType == 'type-kit'){
										// CHECK FOR MATCHING KIT

										// ✅ Collect 'Kit Assigned' values
										let kitAssignedValues = [];
										let matchedRoomId = null;  // ✅ Store the matched room ID
										//this.log('info', `Room Board Items Retrieved: ${JSON.stringify(roomBoardItems, null, 2)}`);

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
															
															this.log('debug', `Pre-match roomBoardItems: ${JSON.stringify(roomBoardItems, null, 2)}`);
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
		const pollingRateMs = pollingRateMinutes * 10 * 1000; // CHANGE 10 to 60. 
	
		this.log('info', `Starting syncing process. Polling every ${pollingRateMinutes} minute(s).`);
	
		// Run syncEvent immediately before setting the interval
		this.syncEvent();
	
		// Set interval to call syncEvent at the configured rate
		this.syncingProcessInterval = setInterval(() => {
			this.syncEvent();
		}, pollingRateMs);
	}

	
	async syncEvent() {
		// Check if auto-sync is enabled
		const autoSyncStatus = this.getVariableValue('auto-sync') || 'enabled';
		
		// Only skip sync if auto-sync is disabled AND it's not a force sync
		if (autoSyncStatus === 'disabled' && !this.forceSyncInProgress) {
			this.log('info', 'Auto-Sync is disabled. Running offlineSyncEvent instead.');
			await this.offlineSyncEvent();
			return;
		}
	
		const projectOverviewId = this.getVariableValue('synced-project-overview-item-id');
		const roomInfoBoardId = this.getVariableValue('synced-room-info-board');
		const presentationManagementBoardId = this.getVariableValue('synced-presentation-management-board');
	
		this.log('info', `\nBase Values Seeded:\nproject-overview: ${projectOverviewId}\nroom-info: ${roomInfoBoardId}\npresentation-management: ${presentationManagementBoardId}`);
	
		if (!presentationManagementBoardId || presentationManagementBoardId === 'Unknown') {
			this.log('warn', 'Presentation Management Board ID is not set. Skipping query.');
			return;
		}
	
		const myRoomId = this.getVariableValue('my-room') || 'Unknown';
		if (myRoomId === 'Unknown') {
			this.log('warn', 'No room assigned (my-room is Unknown). Skipping query.');
			return;
		}
		this.log('info', `Filtering presentations for Room ID: ${myRoomId}`);
	
		try {
			const validPresentations = await this.getTodaysPresentations(presentationManagementBoardId, myRoomId);
			
			// Write to cache file
			await this.writeSyncDataToFile(validPresentations);
	
			// Capture the local time
			const now = new Date();
			this.log('info', `Current Time (Local Machine): ${now.toLocaleString()}`);
	
			// Assign previous, current, and next presentations
			let previousPresentation = null;
			let currentPresentation = null;
			let nextPresentation = null;
	
			const completionThreshold = this.config['completion-percent-threshold'] || 35; // Get threshold from config
			let calculatedCompletionPercent = "0"; // Default value
	
			for (let i = 0; i < validPresentations.length; i++) {
				const presentation = validPresentations[i];
			
				if (presentation.startTime <= now && now < presentation.endTime) {
					// Only check completion percentage if there's a next presentation available
					if (i + 1 < validPresentations.length) {
						calculatedCompletionPercent = this.calculateProgress(presentation.startTime, presentation.endTime);
			
						if (parseFloat(calculatedCompletionPercent) > completionThreshold) {
							this.log(
								'info',
								`Presentation "${presentation.name}" completion percentage of ${calculatedCompletionPercent}% exceeds threshold of ${completionThreshold}%, skipping to next.`
							);
			
							previousPresentation = presentation;
							currentPresentation = validPresentations[i + 1];
							nextPresentation = i + 2 < validPresentations.length ? validPresentations[i + 2] : null;
							break;
						}
					}
			
					// If no next presentation or threshold not exceeded, use normal assignment
					currentPresentation = presentation;
					previousPresentation = i > 0 ? validPresentations[i - 1] : null;
					nextPresentation = i + 1 < validPresentations.length ? validPresentations[i + 1] : null;
			
					// Store the calculated progress for the selected current presentation
					calculatedCompletionPercent = this.calculateProgress(presentation.startTime, presentation.endTime);
			
					break;
				} else if (presentation.startTime > now) {
					nextPresentation = presentation;
					previousPresentation = i > 0 ? validPresentations[i - 1] : null;
					break;
				} else {
					previousPresentation = presentation;
				}
			}
			
			// Prevent syncing when time-mode is disabled
			const timeMode = this.getVariableValue('time-mode') || 'enabled';
			if (timeMode === 'disabled') {
				this.setVariableValues({'last-board-sync': now.toLocaleString()});
				this.log('info', 'Time Mode is disabled. Presentation List updated, variables will not be updated to match time.');
				this.checkFeedbacks('last_sync_status');
				return;
			}
	
			// Log identified presentations
			const completionPercent = calculatedCompletionPercent;
			
			this.log('info', `Previous Presentation: ${previousPresentation ? previousPresentation.name : "None"}`);
			this.log('info', `Current Presentation: ${currentPresentation ? currentPresentation.name : "None"}`);
			this.log('info', `Next Presentation: ${nextPresentation ? nextPresentation.name : "None"}`);
	
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
				'presentation-file-path-p': previousPresentation ? previousPresentation.filePath : 'Unknown',
	
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
				'presentation-file-path-c': currentPresentation ? currentPresentation.filePath : 'Unknown',
	
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
				'presentation-file-path-n': nextPresentation ? nextPresentation.filePath : 'Unknown',
	
				// Board Sync Status
				'board-sync-status': 'Synced',
				'last-board-sync': now.toLocaleString()
			});
			this.checkFeedbacks('last_sync_status');
	
		} catch (error) {
			this.log('error', `Error in syncEvent: ${error.message}`);
			this.setVariableValues({ 'board-sync-status': 'Last Sync Failed' });
			this.checkFeedbacks('last_sync_status');
			
			// Only fall back to offline sync if not a force sync
			if (!this.forceSyncInProgress) {
				this.log('info', `🔄 Switching to offline mode... Running offlineSyncEvent()`);
				return this.offlineSyncEvent();
			}
		} finally {
			// Reset force sync flag
			this.forceSyncInProgress = false;
		}
	}

	async getTodaysPresentations(presentationManagementBoardId, myRoomId) {
		try {
			this.log('info', `Querying Presentation Management Board (ID: ${presentationManagementBoardId})...`);
			let presentationBoardItems;
			try {
				presentationBoardItems = await this.queryMondayBoard(presentationManagementBoardId);
	
				if (!presentationBoardItems || presentationBoardItems.length === 0) {
					throw new Error(`No items found on Presentation Management Board (ID: ${presentationManagementBoardId}).`);
				}
			} catch (error) {
				throw new Error(`API call to Monday.com failed: ${error.message}`);
			}
	
			// Filter out presentations that do not belong to `my-room`
			const filteredPresentations = presentationBoardItems.filter(item => {
				const roomInfoField = item.fields.find(field => field.id === "connect_boards_mkn2244w");
	
				if (!roomInfoField || roomInfoField.raw_value === "N/A") {
					return false; // Exclude items with no valid room info
				}
	
				try {
					const rawData = JSON.parse(roomInfoField.raw_value);
					if (!rawData.linkedPulseIds || rawData.linkedPulseIds.length === 0) {
						return false; // No linked rooms
					}
					const linkedRoomId = rawData.linkedPulseIds[0].linkedPulseId;
					return linkedRoomId.toString() === myRoomId.toString();
				} catch (error) {
					this.log('error', `Error parsing Room Info for item ${item.id}: ${error.message}`);
					return false;
				}
			});
	
			if (filteredPresentations.length === 0) {
				this.log('warn', `No presentations found for Room ID: ${myRoomId}`);
				return [];
			}
	
			// Get today's date in YYYY-MM-DD format
			const todayDate = new Date().toISOString().split('T')[0];
	
			// Filter presentations to only include those happening TODAY
			const todayPresentations = filteredPresentations.filter(p => {
				const sessionDate = this.getFieldValue(p.fields, "date__1");
				return sessionDate && sessionDate === todayDate;
			});
	
			// Remove presentations missing start or end times
			const validPresentations = todayPresentations.map((item) => ({
				id: item.id,
				name: item.name,
				presenter: this.getFieldValue(item.fields, "text__1"),
				designation: this.getFieldValue(item.fields, "text9__1"),
				sessionDate: this.getFieldValue(item.fields, "date__1"),
				startTime: this.parseTime(this.getFieldValue(item.fields, "hour__1")),
				endTime: this.parseTime(this.getFieldValue(item.fields, "dup__of_start_time__1")),
				allowDemo: this.convertCheckboxValue(this.getFieldValue(item.fields, "checkbox__1")),
				record: this.convertCheckboxValue(this.getFieldValue(item.fields, "dup__of_allow_demo__1")),
				stream: this.convertCheckboxValue(this.getFieldValue(item.fields, "dup__of_allow_records__1")),
				streamAddress: this.getFieldValue(item.fields, "dup__of_notes__1"),
				filePath: this.getFieldValue(item.fields, "text_mkna2hcs"),
				presenterPassword: this.getFieldValue(item.fields, "text_mkmvmmgp"),
				speakerReadyFilePath: this.getFieldValue(item.fields, "text_mkncbg3r")
			})).filter(p => p.startTime && p.endTime);
	
			// Sort presentations by start time (earliest first)
			validPresentations.sort((a, b) => a.startTime - b.startTime);
	
			if (validPresentations.length === 0) {
				this.log('warn', `No valid presentations scheduled for today in Room ID: ${myRoomId}`);
				return [];
			}
	
			return validPresentations;
	
		} catch (error) {
			this.log('error', `Error in getTodaysPresentations: ${error.message}`);
			throw error;
		}
	}
	
	async offlineSyncEvent() {
		this.log('info', `🔄 Running offline sync using cached presentation data...`);
	
		// 📌 Determine the file path based on OS
		let baseDir;
		if (process.platform === 'win32') {
			baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
		} else {
			baseDir = path.join('/var/lib', 'BitCompanionSync'); // Linux/Mac
		}
	
		const filePath = path.join(baseDir, 'presentation_sync_data.json');
	
		// 📌 Read the cached file
		if (!fs.existsSync(filePath)) {
			this.log('warn', `⚠ Cached presentation data not found. Skipping offline sync.`);
			return;
		}
	
		let cachedData;
		try {
			const fileContent = fs.readFileSync(filePath, 'utf-8');
			cachedData = JSON.parse(fileContent);
		} catch (error) {
			this.log('error', `❌ Error reading cached presentation file: ${error.message}`);
			return;
		}
	
		// 📌 Extract presentations and room ID
		const { presentations, myRoom } = cachedData;
	
		if (!Array.isArray(presentations) || presentations.length === 0) {
			this.log('warn', `⚠ No presentations found in cache.`);
			return;
		}
	
		this.log('info', `✅ Loaded ${presentations.length} presentations from cache.`);
	
		// 📌 Get today's date in YYYY-MM-DD format
		const todayDate = new Date().toISOString().split('T')[0];
	
		// 📌 Filter presentations happening today
		const todayPresentations = presentations.filter(p => p.sessionDate === todayDate);
	
		if (todayPresentations.length === 0) {
			this.log('warn', `⚠ No presentations scheduled for today.`);
			return;
		}
	
		this.log('info', `📅 Found ${todayPresentations.length} presentations scheduled for today.`);
	
		// ✅ Convert start and end times into Date objects
		todayPresentations.forEach(p => {
			p.startTime = new Date(p.startTime);
			p.endTime = new Date(p.endTime);
		});
	
		// ✅ Sort presentations by start time
		todayPresentations.sort((a, b) => a.startTime - b.startTime);
	
		// Check if time mode is disabled
		const timeMode = this.getVariableValue('time-mode');
		if (timeMode === 'disabled') {
			this.log('info', '⚠ Time Mode is disabled - skipping presentation updates');
			this.setVariableValues({ 'board-sync-status': 'Offline' });
			this.checkFeedbacks('last_sync_status');
			return;
		}
	
		const now = new Date();
		let previousPresentation = null;
		let currentPresentation = null;
		let nextPresentation = null;
	
		const completionThreshold = this.config['completion-percent-threshold'] || 35; // Default 35%
	
		for (let i = 0; i < todayPresentations.length; i++) {
			const presentation = todayPresentations[i];
	
			if (presentation.startTime <= now && now < presentation.endTime) {
				// ✅ Check completion percentage
				if (i + 1 < todayPresentations.length) {
					const completionPercent = this.calculateProgress(presentation.startTime, presentation.endTime);
	
					if (parseFloat(completionPercent) > completionThreshold) {
						this.log('info', `⏩ Skipping "${presentation.name}" (Completion: ${completionPercent}%) - Moving to next.`);
						previousPresentation = presentation;
						currentPresentation = todayPresentations[i + 1];
						nextPresentation = i + 2 < todayPresentations.length ? todayPresentations[i + 2] : null;
						break;
					}
				}
	
				// ✅ Assign normally if threshold is not exceeded
				currentPresentation = presentation;
				previousPresentation = i > 0 ? todayPresentations[i - 1] : null;
				nextPresentation = i + 1 < todayPresentations.length ? todayPresentations[i + 1] : null;
				break;
			} else if (presentation.startTime > now) {
				nextPresentation = presentation;
				previousPresentation = i > 0 ? todayPresentations[i - 1] : null;
				break;
			} else {
				previousPresentation = presentation;
			}
		}
	
		this.log('info', `Previous: ${previousPresentation ? previousPresentation.name : "None"}`);
		this.log('info', `Current: ${currentPresentation ? currentPresentation.name : "None"}`);
		this.log('info', `Next: ${nextPresentation ? nextPresentation.name : "None"}`);
	
		// ✅ Update Companion variables only if time mode is enabled
		this.setVariableValues({
			'board-sync-status': 'Offline',
			'presentation-name-p': previousPresentation ? previousPresentation.name : 'Unknown',
			'presentation-presenter-p': previousPresentation ? previousPresentation.presenter : 'Unknown',
			'presentation-timeslot-p': previousPresentation
				? `${this.formatTime(previousPresentation.startTime)} - ${this.formatTime(previousPresentation.endTime)}`
				: 'Unknown',
			'allow-demo-p': previousPresentation ? previousPresentation.allowDemo : 'Unknown',
			'allow-record-p': previousPresentation ? previousPresentation.record : 'Unknown',
			'allow-stream-p': previousPresentation ? previousPresentation.stream : 'Unknown',
			'stream-address-p': previousPresentation ? previousPresentation.streamAddress : 'Unknown',
			'presentation-file-path-p' : previousPresentation ? previousPresentation.filePath: 'Unknown',
	
			'presentation-name-c': currentPresentation ? currentPresentation.name : 'Unknown',
			'presentation-presenter-c': currentPresentation ? currentPresentation.presenter : 'Unknown',
			'presentation-timeslot-c': currentPresentation
				? `${this.formatTime(currentPresentation.startTime)} - ${this.formatTime(currentPresentation.endTime)}`
				: 'Unknown',
			'current-presentation-completion-percent': currentPresentation
				? this.calculateProgress(currentPresentation.startTime, currentPresentation.endTime)
				: '0',
			'allow-demo-c': currentPresentation ? currentPresentation.allowDemo : 'Unknown',
			'allow-record-c': currentPresentation ? currentPresentation.record : 'Unknown',
			'allow-stream-c': currentPresentation ? currentPresentation.stream : 'Unknown',
			'stream-address-c': currentPresentation ? currentPresentation.streamAddress : 'Unknown',
			'presentation-file-path-c' : currentPresentation ? currentPresentation.filePath: 'Unknown',
	
			'presentation-name-n': nextPresentation ? nextPresentation.name : 'Unknown',
			'presentation-presenter-n': nextPresentation ? nextPresentation.presenter : 'Unknown',
			'presentation-timeslot-n': nextPresentation
				? `${this.formatTime(nextPresentation.startTime)} - ${this.formatTime(nextPresentation.endTime)}`
				: 'Unknown',
			'allow-demo-n': nextPresentation ? nextPresentation.allowDemo : 'Unknown',
			'allow-record-n': nextPresentation ? nextPresentation.record : 'Unknown',
			'allow-stream-n': nextPresentation ? nextPresentation.stream : 'Unknown',
			'stream-address-n': nextPresentation ? nextPresentation.streamAddress : 'Unknown',
			'presentation-file-path-n' : nextPresentation ? nextPresentation.filePath: 'Unknown'
		});

		 // Add these debug logs
		 const currentStatus = this.getVariableValue('board-sync-status');
		 this.checkFeedbacks('last_sync_status');
		 this.log('info', `Offline Time Mode Sync Complete!`);

	}
	
	/**
	 * Converts checkbox values from Monday:
	 * - `"v"` -> `"Yes"`
	 * - `"N/A"` -> `"No"`
	 */
	convertCheckboxValue(value) {
		this.log('debug', `🔍 Converting checkbox value: ${JSON.stringify(value)}`);
	
		return value === "v" ? "Yes" : "No";
	}
	
	
	/**
	 * Helper function to get field value by ID
	 */
	getFieldValue(fields, fieldId) {
		const field = fields.find(f => f.id === fieldId);
		
		if (!field) {
		//	this.log('warn', `⚠ Field '${fieldId}' not found in item fields.`);
			return "Unknown";
		}
	
		if (!field.text || field.text === "N/A") {
		//	this.log('warn', `⚠ Field '${fieldId}' exists but has 'N/A' value.`);
			return "Unknown";
		}
	
		return field.text;
	}
	
	
	
	/**
	 * Parses time in format "hh:mm AM/PM" and returns a Date object
	 */
	parseTime(timeStr) {
		if (!timeStr || timeStr === "N/A") return "Unknown";
	
		const now = new Date();
		const [time, modifier] = timeStr.split(" ");
		let [hours, minutes] = time.split(":").map(Number);
	
		if (modifier === "PM" && hours !== 12) {
			hours += 12;
		} else if (modifier === "AM" && hours === 12) {
			hours = 0;
		}
	
		now.setHours(hours, minutes, 0, 0);
		
		// Log to verify if time is correctly parsed
		//this.log('info', `✅ Parsed time '${timeStr}' to: ${now}`);
	
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
		if (now < startTime) return "0";  // Future presentation
    	if (now >= endTime) return "100"; // Past presentation
		const totalDuration = endTime - startTime;
		const elapsed = now - startTime;
		return ((elapsed / totalDuration) * 100).toFixed(2);
	}

	// SAVING // CACHING SYSTEM
	writeSyncDataToFile(filteredPresentations) {
		try {

			 // 📌 Log the full array of filtered presentations before processing (FOR DEBUGGING)
			//this.log('info', `🔍 Raw filteredPresentations: ${JSON.stringify(filteredPresentations, null, 2)}`);

			// Ensure `filteredPresentations` is an array before proceeding
			if (!Array.isArray(filteredPresentations) || filteredPresentations.length === 0) {
				this.log('error', '❌ Invalid or empty data: filteredPresentations is not an array.');
				return;
			}
	
			// 📌 Determine the global storage path based on OS
			let baseDir;
			if (process.platform === 'win32') {
				baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
			} else {
				baseDir = path.join('/var/lib', 'BitCompanionSync'); // Linux/Mac
			}
	
			// 📌 Ensure the directory exists
			if (!fs.existsSync(baseDir)) {
				fs.mkdirSync(baseDir, { recursive: true });
				this.log('info', `📂 Created global directory: ${baseDir}`);
			}
	
			// 📌 Define the file path inside the global directory
			const filePath = path.join(baseDir, 'presentation_sync_data.json');
	
			// 📌 Prepare the export data
			// Extract correct values from fields
			const exportData = {
				timestamp: new Date().toISOString(),
				lastBoardSync: this.getVariableValue('last-board-sync') || "Unknown",
				syncedRoomInfoBoard: this.getVariableValue('synced-room-info-board') || "Unknown",
				syncedPresentationManagementBoard: this.getVariableValue('synced-presentation-management-board') || "Unknown",
				myRoom: this.getVariableValue('my-room') || "Unknown",
				presentations: filteredPresentations.map(presentation => {
					return {
						id: presentation.id || "Unknown",
						name: presentation.name || "Unknown",
						presenter: presentation.presenter || "Unknown",
						designation: presentation.designation || "Unknown",
						sessionDate: presentation.sessionDate || "Unknown",
						startTime: presentation.startTime,
						endTime: presentation.endTime,
						allowDemo: presentation.allowDemo || "Unknown",
						record: presentation.record || "Unknown",
						stream: presentation.stream || "Unknown",
						streamAddress: presentation.streamAddress || "Unknown",
						filePath: presentation.filePath || "Unknown",
						presenterPassword: presentation.presenterPassword || "Unknown",
						speakerReadyFilePath: presentation.speakerReadyFilePath || "Unknown"
					};
				})
			};

	
			// 📌 Debugging: Log first presentation object for troubleshooting
			if (exportData.presentations.length > 0) {
				//this.log('info', `🛠 First Presentation Object for Debugging: ${JSON.stringify(exportData.presentations[0], null, 2)}`);
			} else {
				//this.log('warn', `⚠ No presentations to save.`);
			}

			// 📌 Write the data to a JSON file
			const tempFilePath = filePath + '.tmp';
			fs.writeFile(tempFilePath, JSON.stringify(exportData, null, 2), (err) => {
				if (err) {
					this.log('error', `❌ Failed to write sync data file: ${err.message}`);
				} else {
					fs.renameSync(tempFilePath, filePath);
					this.log('info', `✅ Sync data successfully written to ${filePath}`);
					this.setVariableValues({
						'last-board-sync': new Date().toLocaleString(),
						'board-sync-status': 'Synced'
					});
					this.checkFeedbacks('last_sync_status');
				}
			});
		} catch (error) {
			this.log('error', `❌ Unexpected error in writeSyncDataToFile: ${error.message}`);
		}
	}

	    // 📌 Add updatePresentationPosition() Update Presentation Position based on current time. (To be used when time-mode is disabled to determine current presentation.)
		async updatePresentationPosition() {
			try {
				// 📌 Determine the file path based on OS
				let baseDir;
				if (process.platform === 'win32') {
					baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
				} else {
					baseDir = path.join('/var/lib', 'BitCompanionSync'); // Linux/Mac
				}
	
				const filePath = path.join(baseDir, 'presentation_sync_data.json');
	
				// 📌 Read the cached file
				if (!fs.existsSync(filePath)) {
					this.log('warn', `⚠ No cached presentation data found. Defaulting presentation position to 1.`);
					this.setVariableValues({ 'time-mode-disabled-presentation-position': 1 });
					return;
				}
	
				let cachedData;
				try {
					const fileContent = fs.readFileSync(filePath, 'utf-8');
					cachedData = JSON.parse(fileContent);
				} catch (error) {
					this.log('error', `❌ Error reading cached presentation file: ${error.message}`);
					return;
				}
	
				// 📌 Extract presentations
				const presentations = cachedData.presentations;
				if (!Array.isArray(presentations) || presentations.length === 0) {
					this.log('warn', `⚠ No presentations found in cache.`);
					this.setVariableValues({ 'time-mode-disabled-presentation-position': 1 });
					return;
				}
	
				// ✅ Convert start and end times into Date objects
				presentations.forEach(p => {
					p.startTime = new Date(p.startTime);
					p.endTime = new Date(p.endTime);
				});
	
				// ✅ Sort presentations by start time
				presentations.sort((a, b) => a.startTime - b.startTime);
	
				// 📌 Get current local time
				const now = new Date();
				this.log('info', `🔍 Current Local Time: ${now.toLocaleString()}`);
	
				// 📌 Determine current presentation position
				let presentationPosition = 1;
				for (let i = 0; i < presentations.length; i++) {
					const presentation = presentations[i];
	
					if (presentation.startTime <= now && now < presentation.endTime) {
						// ✅ Found active presentation
						presentationPosition = i + 1;
						break;
					} else if (presentation.startTime > now) {
						// ✅ Next presentation in sequence
						presentationPosition = i + 1;
						break;
					}
				}
	
				// ✅ Update variable
				this.setVariableValues({ 'time-mode-disabled-presentation-position': presentationPosition });
				this.log('info', `✅ Stored Presentation Position: ${presentationPosition}`);
	
			} catch (error) {
				this.log('error', `❌ Unexpected error in updatePresentationPosition: ${error.message}`);
			}
		}
	
		// AFTER UPDATING the presentation position while time-mode is disabled, this will set the variables of all previous/current/next presentations to match the chosen position. 
		async setManualPresentationPosition() {
			try {
				this.log('info', '=== Starting setManualPresentationPosition ===');
				const presentationManagementBoardId = this.getVariableValue('synced-presentation-management-board');
				const myRoomId = this.getVariableValue('my-room') || 'Unknown';
				let validPresentations = [];
		
				this.log('info', `Using Board ID: ${presentationManagementBoardId}`);
				this.log('info', `Using Room ID: ${myRoomId}`);
		
				// Try to get presentations from API first
				try {
					validPresentations = await this.getTodaysPresentations(presentationManagementBoardId, myRoomId);
					this.log('info', `Successfully got ${validPresentations.length} presentations from API`);
				} catch (error) {
					this.log('info', `Failed to get presentations from API, falling back to cache: ${error.message}`);
					
					// Read from cache if API fails
					try {
						// Determine file path based on OS
						let baseDir;
						if (process.platform === 'win32') {
							baseDir = path.join(process.env.APPDATA || 'C:\\ProgramData', 'BitCompanionSync');
						} else {
							baseDir = path.join('/var/lib', 'BitCompanionSync');
						}
						const filePath = path.join(baseDir, 'presentation_sync_data.json');
						
						this.log('info', `Reading from cache file: ${filePath}`);
						
						const fileContent = fs.readFileSync(filePath, 'utf-8');
						const cachedData = JSON.parse(fileContent);
						validPresentations = cachedData.presentations;
						
						// Filter for today's presentations
						const todayDate = new Date().toISOString().split('T')[0];
						this.log('info', `Filtering for today's date: ${todayDate}`);
						this.log('info', `Total presentations in cache before filtering: ${validPresentations.length}`);
						
						validPresentations = validPresentations.filter(p => p.sessionDate === todayDate);
						this.log('info', `Presentations found for today: ${validPresentations.length}`);
						
						if (!validPresentations || validPresentations.length === 0) {
							throw new Error('No valid presentations found in cache for today');
						}
					} catch (error) {
						this.log('error', `Failed to read from cache: ${error.message}`);
						return;
					}
				}
		
				// Get the position value
				const position = parseInt(this.getVariableValue('time-mode-disabled-presentation-position')) || 1;
				this.log('info', `Current requested position: ${position}`);
				this.log('info', `Total valid presentations: ${validPresentations.length}`);
		
				// Validate position
				if (position < 1 || position > validPresentations.length) {
					this.log('error', `Invalid position ${position}. Must be between 1 and ${validPresentations.length}`);
					return;
				}
		
				// Get previous, current, and next presentations based on position
				const currentIndex = position - 1;
				this.log('info', `Using array index: ${currentIndex}`);
		
				const currentPresentation = validPresentations[currentIndex];
				const previousPresentation = currentIndex > 0 ? validPresentations[currentIndex - 1] : null;
				const nextPresentation = currentIndex < validPresentations.length - 1 ? validPresentations[currentIndex + 1] : null;
		
				// Debug log the full presentation data
				this.log('info', `Current Presentation Data: ${JSON.stringify(currentPresentation, null, 2)}`);
		
				// Log the selections
				this.log('info', `Previous Presentation: ${previousPresentation ? previousPresentation.name : "None"}`);
				this.log('info', `Current Presentation: ${currentPresentation ? currentPresentation.name : "None"}`);
				this.log('info', `Next Presentation: ${nextPresentation ? nextPresentation.name : "None"}`);
		
				// Update Companion variables
				this.log('info', 'Updating Companion variables...');
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
					'presentation-file-path-p': previousPresentation ? previousPresentation.filePath : 'Unknown',
		
					// Current Presentation
					'presentation-name-c': currentPresentation ? currentPresentation.name : 'Unknown',
					'presentation-presenter-c': currentPresentation ? currentPresentation.presenter : 'Unknown',
					'presentation-timeslot-c': currentPresentation
						? `${this.formatTime(currentPresentation.startTime)} - ${this.formatTime(currentPresentation.endTime)}`
						: 'Unknown',
					'current-presentation-completion-percent': "0", // Manual position doesn't use completion percent
					'allow-demo-c': currentPresentation ? currentPresentation.allowDemo : 'Unknown',
					'allow-record-c': currentPresentation ? currentPresentation.record : 'Unknown',
					'allow-stream-c': currentPresentation ? currentPresentation.stream : 'Unknown',
					'stream-address-c': currentPresentation ? currentPresentation.streamAddress : 'Unknown',
					'presentation-file-path-c': currentPresentation ? currentPresentation.filePath : 'Unknown',
		
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
					'presentation-file-path-n': nextPresentation ? nextPresentation.filePath : 'Unknown',
				});
				this.log('info', '=== Completed setManualPresentationPosition ===');
		
			} catch (error) {
				this.log('error', `Error in setManualPresentationPosition: ${error.message}`);
				this.log('error', `Stack trace: ${error.stack}`);
			}
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
