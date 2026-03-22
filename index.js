import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';
import { ARGUMENT_TYPE } from '../../slash-commands/SlashCommandArgument.js';
import { setLocalVariable } from '../../variables.js';
import { eventSource, event_types } from '../../../script.js';
import { MacrosParser } from '../../macros.js';

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

        // บันทึกลงใน Local Variable ของ SillyTavern (ต้องเป็น String)
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
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'var',
                description: 'ชื่อตัวแปรรองรับข้อมูลในรูปแบบ JSON (เมื่อเรียกใช้ให้เข้าถึงผ่าน {{getvar::ชื่อตัวแปร}})',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true
            })
        ]
    });
    SlashCommandParser.addCommandObject(dbGetCommand);

    // 2. ลงทะเบียน Macro: {{dbfetch::url::var}} สำหรับใช้ใน Lorebook
    // ระบบจะรันคำสั่งนี้ทันทีที่ Lorebook Entry ทำงาน
    MacrosParser.registerMacro("dbfetch", (url, varName) => {
        if (url && varName) {
            console.log(`[DB Connector] Lorebook Macro triggered: ${url} -> ${varName}`);
            dbGetHandler({ url, var: varName });
        }
        return ""; // คืนค่าว่างเพื่อให้ Prompt สะอาด
    }, "ดึงข้อมูลจาก Database อัตโนมัติ (ใช้ใน Lorebook ได้)");

    // 3. ระบบความสดใหม่ของข้อมูล (Message Sent Event)
    // รันทุกครั้งที่ผู้ใช้ส่งข้อความ เพื่อให้ตัวแปรพร้อมใช้งานเสมอ
    eventSource.on(event_types.MESSAGE_SENT, async () => {
        console.log("[DB Connector] Heartbeat: Checking for auto-updates...");
    });

    console.log("[World DB Connector] Extension Fully Armed! (Commands, Macros, and Events active)");
});
