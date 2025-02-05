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
			'poll-rate': '30000',
			'allow-demo': 'Unknown',
			'allow-record': 'Unknown',
			'allow-stream': 'Unknown',
			'stream-address': 'Unknown',
			'board-sync-status': 'Unsynced',
			'last-board-sync': 'Never'
		});
	
		// Query the Monday board initially
		const boardId = 7885126203; // Replace with the actual board ID
		this.queryMondayBoard(boardId);
	
		// Set an interval to query the board every 30 seconds
		this.mondaySyncInterval = setInterval(() => this.queryMondayBoard(boardId), 30000);
	}
	
	async destroy() {
		this.log('debug', 'destroy')
	
		// Clear the interval when the instance is destroyed
		if (this.mondaySyncInterval) {
			clearInterval(this.mondaySyncInterval);
		}
	}
	

	async configUpdated(config) {
		this.config = config
	}
	
	// Method to retrieve the Monday API Token
	retrieveMondayApiToken() {
		const mondayApiToken = this.config['monday-api-token'];

		if (!mondayApiToken) {
			this.log('warn', 'Monday API Token is not set.');
			return null;
		} else {
			this.log('info', 'Monday API Token retrieved successfully.');
			return mondayApiToken; // Return the token instead of just logging it
		}
	}


	// queryMondayBoard
	async queryMondayBoard(boardId) {
		// Retrieve the API Token
		const mondayApiToken = this.retrieveMondayApiToken();
		
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
									type
								}
								items_page(limit: 10) {
									items {
										id
										name
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
				this.log('info', `Columns: ${board.columns.map(col => col.title).join(', ')}`);
				
				const items = board.items_page.items;
				this.log('info', `Items: ${items.map(item => item.name).join(', ')}`);
			} else {
				this.log('warn', `No board found with ID ${boardId}`);
			}
	
		} catch (error) {
			this.log('error', `Error querying Monday board: ${error.message}`);
		}
	}
	
	// Return config fields for web config
	getConfigFields() {
		return [
			{
				id: 'monday-api-token',
				type: 'textinput',
				label: 'Monday API Token',
				'default': undefined
			},
			{
				id: 'room-type',
				type: 'dropdown',
				label: 'Kit or Speaker Ready',
				choices: [
					{ id: 'room-type-kit', label: 'Kit' },
					{ id: 'room-type-speaker-ready', label: 'Speaker Ready' },
				],
				default: undefined
			},
			{
				id: 'kit-number',
				type: 'number',
				label: 'Kit/SR Number',
				default: undefined,
				min: 1,
				max: 100
			}
		]
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
