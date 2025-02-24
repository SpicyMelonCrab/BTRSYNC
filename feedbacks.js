const { combineRgb } = require('@companion-module/base')

module.exports = function (self) {
    self.setFeedbackDefinitions({
        current_presentation_active: {
            type: 'boolean',
            name: 'Current Presentation Active',
            description: 'Changes button color when a presentation is in progress.',
            defaultStyle: {
                bgcolor: combineRgb(0, 255, 0), // Green when active
                color: combineRgb(0, 0, 0),
            },
            callback: (feedback) => {
                const actualStartTime = self.getVariableValue('current-presentation-actual-start-time');
                return actualStartTime !== 'None'; // Active if start time is set
            },
        },
        presentation_nearing_end: {
            type: 'boolean',
            name: 'Presentation Nearing End',
            description: 'Changes button color when less than 5 minutes remain.',
            defaultStyle: {
                bgcolor: combineRgb(255, 0, 0), // Red when active
                color: combineRgb(255, 255, 255),
            },
            callback: (feedback) => {
                const duration = self.getVariableValue('current-presentation-actual-duration');
                if (duration === 'None') return false;
                const remainingTime = parseFloat(duration);
                return remainingTime <= 5; // Active if <= 5 minutes remaining
            },
        },
        auto_sync_status: {
            type: 'boolean',
            name: 'Auto Sync On/Off',
            description: 'Shows blue when enabled, black when disabled',
            defaultStyle: {
                bgcolor: combineRgb(0, 200, 255),
                color: combineRgb(255, 255, 255)
            },
            callback: (feedback) => {
                const autoSync = self.getVariableValue('auto-sync');
                return autoSync === 'enabled';
            }
        },
        time_mode_status: {
            type: 'boolean',
            name: 'Time Mode On/Off',
            description: 'Shows purple when enabled, black when disabled',
            defaultStyle: {
                bgcolor: combineRgb(200, 100, 255),
                color: combineRgb(255, 255, 255)
            },
            callback: (feedback) => {
                const timeMode = self.getVariableValue('time-mode');
                return timeMode === 'enabled';
            }
        },
        sync_status: {
            type: 'boolean',
            name: 'Sync Status Color',
            description: 'Change background color based on sync status',
            options: [
                {
                    type: 'dropdown',
                    label: 'Status',
                    id: 'status',
                    default: 'Synced',
                    choices: [
                        { id: 'Synced', label: 'Synced' },
                        { id: 'Offline', label: 'Offline' },
                        { id: 'Last Sync Failed', label: 'Last Sync Failed' }
                    ]
                }
            ],
            callback: (feedback) => {  // Change to arrow function to preserve context
                const syncStatus = self.getVariableValue('board-sync-status');
                self.log('debug', `Sync Status Feedback - Requested: ${feedback.options.status}, Current: ${syncStatus}`);
                return syncStatus === feedback.options.status;
            }
        }
    });
}