const csv = require('csv-parser');
const { Parser } = require('json2csv');
const fs = require('fs');

class CSVHelper {
    static async exportToCSV(data, fields, filePath) {
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(data);
        fs.writeFileSync(filePath, csv);
        return filePath;
    }

    static async importFromCSV(filePath) {
        const results = [];
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', (err) => reject(err));
        });
    }
}

module.exports = CSVHelper;
