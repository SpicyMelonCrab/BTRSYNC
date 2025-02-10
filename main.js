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
			'percent-completion-threshold': '0',
			'current-presentation-name-c': 'Unknown',
			'current-presentation-presenter-c': 'Unknown',
			'percent-presentation-timeslot-c': '0',
			'current-presentation-name-p': 'Unknown',
			'current-presentation-presenter-p': 'Unknown',
			'percent-presentation-timeslot-p': '0',
			'current-presentation-name-n': 'Unknown',
			'current-presentation-presenter-n': 'Unknown',
			'percent-presentation-timeslot-n': '0',
			'synced-project-overview-item-id': 'Unknown'
		});
		
		 // Collect information on all Kits.
		 await this.getKits();
		
		// SET POLLING RAGE AND BEIGN QUERYING
		const pollingRate = config['polling-rate-minutes'] || 30;
    	this.repeatingBoardQuery = setInterval(() => this.findSyncedProjectOverview(), pollingRate*1000*60);
	}
	
	async destroy() {
		this.log('debug', 'destroy')
	
		// Clear the interval when the instance is destroyed
		if (this.repeatingBoardQuery) {
			clearInterval(this.repeatingBoardQuery);
		}
	}
	

	async configUpdated(config) {
		this.config = config;
		
		if (this.repeatingBoardQuery) {
			clearInterval(this.repeatingBoardQuery);
		}
	
		// ✅ Reset lastSyncedProjectId to force a re-query after config changes
		this.lastSyncedProjectId = null;
	
		await this.getKits();
	
		const pollingRate = config['polling-rate-minutes'] || .5;
		this.repeatingBoardQuery = setInterval(() => this.findSyncedProjectOverview(), pollingRate*1000*60);
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
		// ✅ Prevent redundant queries if we already found a synced project
		if (this.lastSyncedProjectId) {
			this.log('info', `Skipping redundant query. Last synced project: ${this.lastSyncedProjectId}`);
			
			// ✅ Ensure variable stays updated
			this.setVariableValues({ 'synced-project-overview-item-id': this.lastSyncedProjectId });
	
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
				const projectBoardIdField = project.fields.find(field => field.title === 'Project Board ID');
	
				if (projectBoardIdField && projectBoardIdField.text && projectBoardIdField.text !== "N/A") {
					const projectBoardId = projectBoardIdField.text.trim();
	
					if (!isNaN(projectBoardId)) {
						// Step 4: Query the first item on the found project board
						const projectItems = await this.queryMondayBoard(projectBoardId);
						if (projectItems && projectItems.length > 0) {
							this.log('info', `Found first item on board ${projectBoardId}: ${projectItems[0].id}`);
	
							// Query the first item itself
							const itemDetails = await this.queryMondayItem(projectItems[0].id);
	
							// Step 5: Check for a synced project
							const foundSyncedProject = await this.checkForSyncedProject(itemDetails, selectedKit);
	
							if (foundSyncedProject) {
								this.lastSyncedProjectId = foundSyncedProject.id; // ✅ Store last found project
	
								// ✅ Store in the module's variables so it's visible in the UI
								this.setVariableValues({ 'synced-project-overview-item-id': foundSyncedProject.id });

	
								return foundSyncedProject; // ✅ Return the matched project (name & ID)
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
	
	
	
	/**
	 * Checks if any subitem's linkedPulseId matches the selected kit.
	 */
	async checkForSyncedProject(itemDetails, selectedKit) {
		if (!selectedKit) {
			this.log('error', 'No kit is selected, skipping comparison.');
			return null;
		}
	
		this.log('info', `Selected Kit: ${selectedKit}`);
	
		// Look for subitems field
		const subitemsField = itemDetails.fields.find(field => field.id === 'subitems_mkm5ngss');
		if (!subitemsField || !subitemsField.raw_value) {
			this.log('warn', `No subitems found for item ${itemDetails.id}`);
			return null;
		}
	
		const subitemsData = JSON.parse(subitemsField.raw_value);
	
		if (!subitemsData.linkedPulseIds || subitemsData.linkedPulseIds.length === 0) {
			this.log('warn', `No linkedPulseIds found in subitems for item ${itemDetails.id}`);
			return null;
		}
	
		for (const subitem of subitemsData.linkedPulseIds) {
			const subItemId = subitem.linkedPulseId;
	
			this.log('info', `Checking subitem linkedPulseId: ${subItemId}`);
	
			// Retrieve full details of the subitem
			const subItemDetails = await this.queryMondayItem(subItemId);
			if (!subItemDetails) {
				this.log('warn', `Failed to retrieve details for subitem ${subItemId}`);
				continue;
			}
	
			// Log each field of the subitem
			this.log('info', `Subitem Retrieved: ${subItemDetails.name} (ID: ${subItemDetails.id})`);
			for (const field of subItemDetails.fields) {
				this.log('info', `  - Field: ${field.title} | Value: ${field.text}`);
			}
	
			// 🔍 Check if `connect_boards_mkmnw0dz` has linkedPulseIds inside its raw_value
			const linkedBoardsField = subItemDetails.fields.find(field => field.id === 'connect_boards_mkmnw0dz');
			if (linkedBoardsField && linkedBoardsField.raw_value) {
				try {
					const linkedBoardsData = JSON.parse(linkedBoardsField.raw_value);
					if (linkedBoardsData.linkedPulseIds) {
						for (const linkedPulse of linkedBoardsData.linkedPulseIds) {
							const linkedPulseId = linkedPulse.linkedPulseId;
							this.log('info', `🔍 Found linkedPulseId inside connect_boards_mkmnw0dz: ${linkedPulseId}`);
	
							// Compare with selected kit
							if (linkedPulseId.toString() === selectedKit.toString()) {
								this.log('info', `✅ Synced Project Found! Project Name: ${itemDetails.name}, Project ID: ${itemDetails.id}`);
								return { name: itemDetails.name, id: itemDetails.id };
							}
						}
					}
				} catch (error) {
					this.log('error', `Error parsing raw_value for connect_boards_mkmnw0dz: ${error.message}`);
				}
			}
		}
	
		this.log('warn', 'No matching linkedPulseId found for the selected kit.');
		return null;
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
