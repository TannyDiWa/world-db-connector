alert("Extension World DB Connector is successfully loading the JS file!");
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { setLocalVariable } from '../../../variables.js';

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
            handler: (ctx) => {
                // ใช้การ Join และ Split เพื่อรองรับทั้งแบบ : และ :: และไม่สับสนกับ : ใน URL
                const fullInput = ctx.args.join("::");
                const parts = fullInput.split("::");
                
                const url = parts[0]?.trim();
                const varName = parts[1]?.trim();

                if (url && varName) {
                    console.log(`[DB Connector] Macro triggered: ${url} -> ${varName}`);
                    dbGetHandler({ url, var: varName }, "");
                } else {
                    console.warn("[DB Connector] Macro usage error. Expected {{dbfetch::url::var}}. Got:", fullInput);
                }
                return ""; // คืนค่าว่างเพื่อให้ Prompt สะอาด
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
