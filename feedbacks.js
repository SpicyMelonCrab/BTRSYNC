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
                return self.getVariableValue('auto-sync') === 'enabled'
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
                return self.getVariableValue('time-mode') === 'enabled'
            }
        },
        last_sync_status: {
            type: 'advanced',
            name: 'Sync Status',
            description: 'Shows green when synced, yellow when offline, red when failed',
            options: [],
            callback: (feedback) => {
                const syncStatus = self.getVariableValue('board-sync-status');
                
                switch(syncStatus) {
                    case 'Synced':
                        return {
                            bgcolor: combineRgb(0, 255, 0), // Green
                            color: combineRgb(255, 255, 255)
                        };
                    case 'Offline':
                        return {
                            bgcolor: combineRgb(255, 255, 0), // Yellow
                            color: combineRgb(0, 0, 0)
                        };
                    case 'Last Sync Failed':
                        return {
                            bgcolor: combineRgb(255, 0, 0), // Red
                            color: combineRgb(255, 255, 255)
                        };
                    default:
                        return {
                            bgcolor: combineRgb(0, 0, 0), // Black
                            color: combineRgb(255, 255, 255)
                        };
                }
            }
        }
    });
}