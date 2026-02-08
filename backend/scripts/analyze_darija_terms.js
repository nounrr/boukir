import pool from '../db/pool.js';

const analyze = async () => {
    console.log('Starting Darija term analysis...');
    try {
        const [rows] = await pool.query('SELECT designation FROM products');
        console.log(`Loaded ${rows.length} products.`);

        const wordCounts = {};
        const arabicPattern = /[\u0600-\u06FF]+/g;

        for (const row of rows) {
            if (!row.designation) continue;
            const text = String(row.designation);
            const matches = text.match(arabicPattern);
            if (matches) {
                for (const word of matches) {
                    // Normalize: remove tashkeel if any (simple), trim
                    const w = word.trim();
                    if (w.length < 2) continue; // skip single letters
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            }
        }

        // Convert to array and sort
        const sorted = Object.entries(wordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50); // Top 50

        console.log('Top 50 Arabic/Darija terms found:');
        sorted.forEach(([word, count]) => {
            console.log(`${word}: ${count}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

analyze();
