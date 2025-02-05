module.exports = function (self) {
	self.setVariableDefinitions([
		{ variableId: 'poll-rate', name: 'Poll Rate'},
		{ variableId: 'allow-demo', name: 'Allow Demo' },
		{ variableId: 'allow-record', name: 'Allow Record' },
		{ variableId: 'allow-stream', name: 'Allow Stream' },
		{ variableId: 'stream-address', name: 'Stream Address' },
		{ variableId: 'board-sync-status', name: 'Board Sync Status' },
		{ variableId: 'last-board-sync', name: 'Last Board Sync' }
	])
}
