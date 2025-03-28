const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const config = require('./config');

/**
 * Copy a file to the MySQL secure file directory
 * @param {string} sourcePath Original file path
 * @returns {string} Path in MySQL secure directory
 */
function copyToSecureFileDir(sourcePath) {
    const secureDir = config.mysql.secureFilePath;
    if (!secureDir) {
        throw new Error('MySQL secure file path not configured');
    }
    
    // Create destination path
    const fileName = path.basename(sourcePath);
    const destPath = path.join(secureDir, fileName);
    
    try {
        // Use sudo cp for copying to protected directory
        console.log(`Copying ${sourcePath} to ${destPath}...`);
        
        // Try direct copy first
        try {
            fs.copyFileSync(sourcePath, destPath);
            console.log('File copied successfully');
        } catch (err) {
            // If direct copy fails due to permissions, try with sudo
            console.log('Direct copy failed, trying with sudo...');
            child_process.execSync(`sudo cp "${sourcePath}" "${destPath}"`);
            child_process.execSync(`sudo chmod 664 "${destPath}"`); // Make readable by MySQL
            console.log('File copied with sudo successfully');
        }
        
        return destPath;
    } catch (err) {
        console.error('Error copying file:', err.message);
        console.log(`
        Try manually copying the file:
        sudo cp "${sourcePath}" "${destPath}"
        sudo chmod 664 "${destPath}"
        `);
        throw err;
    }
}

/**
 * Delete a file from the MySQL secure file directory
 */
function deleteFromSecureFileDir(fileName) {
    const secureDir = config.mysql.secureFilePath;
    if (!secureDir) {
        return false;
    }
    
    const filePath = path.join(secureDir, fileName);
    
    try {
        // Try direct delete first
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            // If direct delete fails, try with sudo
            child_process.execSync(`sudo rm "${filePath}"`);
        }
        return true;
    } catch (err) {
        console.error('Error deleting file:', err.message);
        return false;
    }
}

module.exports = {
    copyToSecureFileDir,
    deleteFromSecureFileDir
};
