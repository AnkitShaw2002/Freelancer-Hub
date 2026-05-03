require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URL).then(async () => {
    const db = mongoose.connection.db;
    const txs = await db.collection('transactions').find({ projectId: new mongoose.Types.ObjectId('69f2fefa4c543bce3c15347f') }).toArray();
    console.log("All Transactions for this project:");
    txs.forEach(t => {
        console.log(`- Type: ${t.type}, Status: ${t.status}, Ref: ${t.transactionRef}`);
    });
    process.exit(0);
});
