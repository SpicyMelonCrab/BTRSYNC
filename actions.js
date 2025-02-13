module.exports = function (self) {
	self.setActionDefinitions({
		force_sync: {
			name: 'Force Sync Event',
			description: 'Manually triggers the Sync Event immediately.',
			options: [],
			callback: async () => {
				self.log('info', 'Force Sync Event triggered by user.');
				await self.syncEvent();
			},
		},
		toggle_auto_sync: {
			name: 'Toggle Auto Sync Status',
			description: 'Switches auto-sync between enabled and disabled.',
			options: [],
			callback: async () => {
				// Get current status
				const currentStatus = self.getVariableValue('auto-sync') || 'enabled';

				// Toggle value
				const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';

				// Update variable
				self.setVariableValues({ 'auto-sync': newStatus });

				// Log change
				self.log('info', `Auto Sync Status changed to: ${newStatus}`);
			},
		},
		toggle_time_mode: {
			name: 'Toggle Time Mode',
			description: 'Switches time mode between enabled and disabled.',
			options: [],
			callback: async () => {
				// Get current time-mode status
				const currentStatus = self.getVariableValue('time-mode') || 'enabled';

				// Toggle value
				const newStatus = currentStatus === 'enabled' ? 'disabled' : 'enabled';

				// Update variable
				self.setVariableValues({ 'time-mode': newStatus });

				// Log change
				self.log('info', `Time Mode changed to: ${newStatus}`);

				// If time mode is now disabled, calculate and store presentation position
				if (newStatus === 'disabled') {
					self.log('info', 'Time Mode disabled - Determining current presentation position.');
					await self.updatePresentationPosition();
				}
			},
		},
	});
};
