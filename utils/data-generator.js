/**
 * Generate a random number between min and max (inclusive)
 */
function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Generate a random text string of specified length
 */
function randomText(charactersNum) {
    let text = "";
    for (let i = 0; i < charactersNum; i++) {
        const letter = String.fromCharCode(randomNumber(65, 90));
        text += letter;
    }
    return text;
}

/**
 * Generate an array of random data objects
 */
function generateData(size) {
    let data = [];
    for (let i = 0; i < size; i++) {
        const x = randomNumber(1, 100);
        const y = randomNumber(100, 200);
        const z = randomText(randomNumber(5, 20));
        data.push({ x, y, z });
    }
    return data;
}

module.exports = {
    randomNumber,
    randomText,
    generateData
};
