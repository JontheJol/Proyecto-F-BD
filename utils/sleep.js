module.exports = function(time) {
    return new Promise((resolve, reject) => {
        setTimeout(() =>{
            resolve(true);
        }, time * 1000);
    });
}