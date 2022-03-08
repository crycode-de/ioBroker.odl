"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateText = exports.isArray = void 0;
const axios_1 = require("axios");
/**
 * Tests whether the given variable is really an Array
 * @param it The variable to test
 */
function isArray(it) {
    if (Array.isArray != null)
        return Array.isArray(it);
    return Object.prototype.toString.call(it) === '[object Array]';
}
exports.isArray = isArray;
/**
 * Translates text using the Google Translate API
 * @param text The text to translate
 * @param targetLang The target languate
 */
async function translateText(text, targetLang) {
    if (targetLang === 'en')
        return text;
    try {
        const url = `http://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}&ie=UTF-8&oe=UTF-8`;
        const response = await (0, axios_1.default)({ url, timeout: 5000 });
        if (isArray(response.data)) {
            // we got a valid response
            return response.data[0][0][0];
        }
        throw new Error('Invalid response for translate request');
    }
    catch (e) {
        throw new Error(`Could not translate to "${targetLang}": ${e}`);
    }
}
exports.translateText = translateText;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbHMtZGV2LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi90b29scy1kZXYudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaUNBQTBCO0FBRTFCOzs7R0FHRztBQUNILFNBQWdCLE9BQU8sQ0FBQyxFQUFXO0lBQ2pDLElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxJQUFJO1FBQUUsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLGdCQUFnQixDQUFDO0FBQ2pFLENBQUM7QUFIRCwwQkFHQztBQUVEOzs7O0dBSUc7QUFDSSxLQUFLLFVBQVUsYUFBYSxDQUFDLElBQVksRUFBRSxVQUFrQjtJQUNsRSxJQUFJLFVBQVUsS0FBSyxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDckMsSUFBSTtRQUNGLE1BQU0sR0FBRyxHQUFHLDBFQUEwRSxVQUFVLFdBQVcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDO1FBQ3hKLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxlQUFLLEVBQUMsRUFBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7UUFDbkQsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzFCLDBCQUEwQjtZQUMxQixPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDL0I7UUFDRCxNQUFNLElBQUksS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7S0FDM0Q7SUFBQyxPQUFPLENBQUMsRUFBRTtRQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsMkJBQTJCLFVBQVUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0tBQ2pFO0FBQ0gsQ0FBQztBQWJELHNDQWFDIn0=