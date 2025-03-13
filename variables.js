module.exports = function (self) {
	self.setVariableDefinitions([
		{ variableId: 'auto-sync', name: 'Auto-Sync'},
		{ variableId: 'time-mode', name: 'Time Based Presentation Mode'},
		{ variableId: 'time-mode-disabled-presentation-position', name: 'Presentation Position (Time-Mode Disabled)'},
		{ variableId: 'current-presentation-actual-start-time', name: 'Current Presentation Actual Start Time'},
		{ variableId: 'current-presentation-actual-duration', name: 'Current Presentation Actual Duration'},
		{ variableId: 'presentation-file-path-p', name: 'Presentation Path (Previous)' },
		{ variableId: 'presentation-file-path-c', name: 'Presentation Path (Current)' },
		{ variableId: 'presentation-file-path-n', name: 'Presentation Path (Next)' },
		{ variableId: 'allow-demo-p', name: 'Allow Demo (Previous)' },
		{ variableId: 'allow-demo-p', name: 'Allow Demo (Previous)' },
		{ variableId: 'allow-demo-c', name: 'Allow Demo' },
		{ variableId: 'allow-demo-n', name: 'Allow Demo (Next)' },
		{ variableId: 'allow-record-p', name: 'Allow Record (Previous)' },
		{ variableId: 'allow-record-c', name: 'Allow Record' },
		{ variableId: 'allow-record-n', name: 'Allow Record (Next)' },
		{ variableId: 'allow-stream-p', name: 'Allow Stream (Previous)' },
		{ variableId: 'allow-stream-c', name: 'Allow Stream' },
		{ variableId: 'allow-stream-n', name: 'Allow Stream (Next)' },
		{ variableId: 'stream-address-p', name: 'Stream Address (Previous)' },
		{ variableId: 'stream-address-c', name: 'Stream Address' },
		{ variableId: 'stream-address-n', name: 'Stream Address (Next)' },
		{ variableId: 'board-sync-status', name: 'Board Sync Status' },
		{ variableId: 'last-board-sync', name: 'Last Board Sync' },
		{ variableId: 'current-presentation-completion-percent', name: 'Current Presentation % Complete' },
		{ variableId: 'presentation-name-c', name: 'Presentation Name' },
		{ variableId: 'presentation-presenter-c', name: 'Presenter' },
		{ variableId: 'presentation-timeslot-c', name: 'Timeslot' },
		{ variableId: 'presentation-name-p', name: 'Presentation Name (Previous)' },
		{ variableId: 'presentation-presenter-p', name: 'Presenter (Previous)' },
		{ variableId: 'presentation-timeslot-p', name: 'Timeslot (Previous)' },
		{ variableId: 'presentation-name-n', name: 'Presentation Name (Next)' },
		{ variableId: 'presentation-presenter-n', name: 'Presenter (Next)' },
		{ variableId: 'presentation-timeslot-n', name: 'Timeslot (Next)' },
		{ variableId: 'synced-project-overview-item-id', name: 'Synced Project Overview ID' },
		{ variableId: 'synced-room-info-board', name: 'Synced Room Info Board' },
		{ variableId: 'synced-presentation-management-board', name: 'Synced Pres. Mgmt Board' },
		{ variableId: 'synced-help-requests-board', name: 'Synced Help Requests Board' },
		{ variableId: 'presentation-password-input', name: 'Presentation Password Input' },
		{ variableId: 'my-room', name: 'My Room' },
		{ variableId: 'help-request-status', name: 'Help request Status' },
		{ variableId: 'help-request-timestamp', name: 'Help Request TimeStamp' },
		{ variableId: 'current-sr-file-path', name: 'Current SR Presentation File Path' },
		{ variableId: 'current-sr-name', name: 'Current SR Name' },
		{ variableId: 'record-most-recent-presentation', name: 'Stored from REAL Presentation Start time to 5> next presentation start time' }
		

	])
}
