const { WebcastPushConnection } = require('tiktok-live-connector');
let connection = new WebcastPushConnection('tiktok');
connection.connect().then(state => {
    console.log('Success:', state.roomId);
    process.exit(0);
}).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
