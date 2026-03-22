// Extension World DB Connector - Loaded successfully
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { setLocalVariable, getLocalVariable } from '../../../variables.js';

// Helper: ดึงข้อมูลแบบ Nested (เช่น stats.affection)
function getDeep(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// Helper: ทำข้อมูลให้เป็นแบนราบ (Flatten) เพื่อให้ AI อ่านง่ายขึ้น
function flattenObject(obj, prefix = '') {
    let result = {};
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            Object.assign(result, flattenObject(obj[key], prefix + key + ' '));
        } else {
            // เปลี่ยน . เป็นช่องว่างหรือตัวช่วยอ่านเพื่อให้ AI เข้าใจบริบทดีขึ้น
            const cleanKey = prefix + key;
            result[cleanKey] = obj[key];
        }
    }
    return result;
}

async function dbGetHandler(args, value) {
    const fetchUrl = args.url;
    const varName = args.var;

    if (!fetchUrl) {
        toastr.error("กรุณาระบุ URL (เช่น url=http://127.0.0.1:8000/data)", "DB Connector: Error");
        return "";
    }

    if (!varName) {
        toastr.error("กรุณาระบุชื่อตัวแปรที่ต้องการบันทึก (เช่น var=my_data)", "DB Connector: Error");
        return "";
    }

    try {
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        const data = await response.json();
        const dataString = JSON.stringify(data);

        // บันทึกลงใน Local Variable ของ SillyTavern
        setLocalVariable(varName, dataString);

        // --- เพิ่มการฉีดข้อมูลเข้า Prompt โดยตรง ---
        try {
            const { setExtensionPrompt, extension_prompt_types, extension_prompt_roles } = await import('../../../../script.js');
            
            // สร้างสรุปแบบอ่านง่ายสำหรับ AI (System Note)
            let summary = `[System Note: Important Character Stats (${varName})]:\n`;
            const flatData = typeof data === 'object' ? flattenObject(data) : { [varName]: data };
            
            for (const [key, val] of Object.entries(flatData)) {
                summary += `- ${key}: ${val}\n`;
            }

            // ฉีดเข้า Prompt ในฐานะ System Role (ความลึก 0 คือล่าสุด)
            setExtensionPrompt(
                `db_connector_${varName}`, 
                summary, 
                extension_prompt_types.IN_PROMPT, 
                0, 
                true, 
                extension_prompt_roles.SYSTEM
            );
            console.log(`[DB Connector] Prompt Injected for ${varName}`);
        } catch (e) {
            console.warn("[DB Connector] Prompt injection failed:", e);
        }
        // ---------------------------------------

        toastr.success(`ข้อมูลถูกบันทึกลงในตัวแปร: ${varName} เรียบร้อยแล้ว`, "DB Connector: Success");
        return dataString;

    } catch (error) {
        console.error("[World DB Connector] Error fetching data:", error);
        toastr.error(`เชื่อมต่อ API ล้มเหลว: ${error.message}`, "DB Connector: Offline!");
        return "";
    }
}

jQuery(async () => {
    // 1. ลงทะเบียนคำสั่ง Slash Command: /db-fetch
    const dbGetCommand = SlashCommand.fromProps({
        name: 'db-fetch',
        callback: dbGetHandler,
        returns: 'string',
        helpString: 'ดึงข้อมูล JSON จาก URL ที่ระบุแล้วบันทึกค่าเก็บไว้เป็น Variable',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'url',
                description: 'API URL ที่ต้องการดึงข้อมูล',
                typeList: ['string'],
                isRequired: true
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'var',
                description: 'ชื่อตัวแปรรองรับข้อมูลในรูปแบบ JSON (เมื่อเรียกใช้ให้เข้าถึงผ่าน {{getvar::ชื่อตัวแปร}})',
                typeList: ['string'],
                isRequired: true
            })
        ]
    });

    SlashCommandParser.addCommandObject(dbGetCommand);

    // 1.1 เพิ่มคำสั่ง /db-inspect เพื่อตรวจสอบค่าตัวแปร
    const dbInspectCommand = SlashCommand.fromProps({
        name: 'db-inspect',
        callback: (args) => {
            const varName = args.var;
            const val = getLocalVariable(varName);
            if (!val) {
                toastr.info(`ไม่พบตัวแปรชื่อ: ${varName}`, "DB Connector");
                return "";
            }
            const message = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
            callGenericPopup(`<pre>${message}</pre>`, "Variable Inspector: " + varName);
            return message;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'var',
                description: 'ชื่อตัวแปรที่ต้องการตรวจสอบ',
                typeList: ['string'],
                isRequired: true
            })
        ]
    });
    SlashCommandParser.addCommandObject(dbInspectCommand);

    // DYNAMIC IMPORT สำหรับระบบ Macro และ Events (ช่วยป้องกันกรณี Path ไฟล์เปลี่ยนไม่ให้ Extension พังทั้งไฟล์)
    try {
        // ดึง MacroRegistry และ Event มาจากตำแหน่งที่ SillyTavern ใช้งาน
        const { MacroRegistry, MacroCategory, MacroValueType } = await import('../../../macros/engine/MacroRegistry.js');
        const { eventSource, event_types } = await import('../../../../script.js');

        // 2. ลงทะเบียน Macro: {{dbfetch::url::var}} สำหรับใช้ใน Lorebook
        MacroRegistry.registerMacro("dbfetch", {
            category: MacroCategory.VARIABLE,
            description: "ดึงข้อมูลจาก URL ด้วยเครื่องหมาย :: เช่น {{dbfetch::http://...::var}}",
            unnamedArgs: [
                { name: "url", type: MacroValueType.STRING, optional: true },
                { name: "var", type: MacroValueType.STRING, optional: true }
            ],
            handler: async (ctx) => {
                // ใช้การ Join และ Split เพื่อรองรับทั้งแบบ : และ :: และไม่สับสนกับ : ใน URL
                const fullInput = ctx.args.join("::");
                const parts = fullInput.split("::");
                
                const url = parts[0]?.trim();
                const varName = parts[1]?.trim();

                if (url && varName) {
                    console.log(`[DB Connector] Macro triggered: ${url} -> ${varName}`);
                    const rawResult = await dbGetHandler({ url, var: varName }, "");
                    if (!rawResult) return "";
                    
                    try {
                        const data = JSON.parse(rawResult);
                        const flatStats = flattenObject(data);
                        let output = `[Stats for ${varName}]:\n`;
                        for (const [k, v] of Object.entries(flatStats)) {
                            output += `- ${k}: ${v}\n`;
                        }
                        return output;
                    } catch (e) {
                        return rawResult; // ถ้าไม่ใช่ JSON ให้คืนค่าดิบ
                    }
                }
 else {
                    console.warn("[DB Connector] Macro usage error. Expected {{dbfetch::url::var}}. Got:", fullInput);
                }
                return ""; // คืนค่าว่างกรณีผิดพลาด
            }
        });

        // 2.1 ลงทะเบียน Macro: {{dbget::varName::path}} สำหรับดึงค่าเฉพาะส่วน
        MacroRegistry.registerMacro("dbget", {
            category: MacroCategory.VARIABLE,
            description: "ดึงค่าจาก JSON ในตัวแปรตาม Path เช่น {{dbget::Alya.stats::stats.affection}}",
            unnamedArgs: [
                { name: "varName", type: MacroValueType.STRING, optional: false },
                { name: "path", type: MacroValueType.STRING, optional: false }
            ],
            handler: (ctx) => {
                const varName = ctx.args[0]?.trim();
                const path = ctx.args[1]?.trim();
                if (!varName || !path) return "";

                const json = getLocalVariable(varName);
                if (!json) return "";

                try {
                    const data = typeof json === 'string' ? JSON.parse(json) : json;
                    const value = getDeep(data, path);
                    const result = value !== undefined ? String(value) : "";
                    console.log(`[DB Connector] dbget triggered: ${varName}.${path} ->`, result);
                    return result;
                } catch (e) {
                    return "";
                }
            }
        });

        // 3. ระบบความสดใหม่ของข้อมูล (Message Sent Event)
        eventSource.on(event_types.MESSAGE_SENT, async () => {
            console.log("[DB Connector] Heartbeat active.");
        });

        console.log("[World DB Connector] Macro and Events registered successfully!");
    } catch (e) {
        console.warn("[World DB Connector] Macros/Events registration failed (but /db-fetch is still active):", e);
    }

    console.log("[World DB Connector] Extension Loaded Successfully! (/db-fetch command registered)");
});
ห