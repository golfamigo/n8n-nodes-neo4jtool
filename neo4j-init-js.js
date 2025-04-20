// ============================================================================
// Neo4j 初始化程式 (Node.js 版本)
// ============================================================================

// 使用方法:
// 1. 安裝 neo4j-driver: npm install neo4j-driver
// 2. 設置環境變數或修改下方連接信息
// 3. 執行: node neo4j-init.js
require('dotenv').config();
const neo4j = require('neo4j-driver');

// 連接設置
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

// 初始化函數
async function initializeNeo4j() {
    let driver, session;
    try {
        console.log('連接到 Neo4j 數據庫...');
        driver = neo4j.driver(
            NEO4J_URI,
            neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
        );

        // 測試連接
        await driver.verifyConnectivity();
        console.log('連接成功!');

        // 創建會話
        session = driver.session({ database: NEO4J_DATABASE });

        // 初始化索引和約束
        console.log('正在初始化約束和索引...');

        // Business 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_business_id IF NOT EXISTS
            FOR (b:Business) REQUIRE b.business_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_business_name IF NOT EXISTS FOR (b:Business) ON (b.name);`);
        await runQuery(session, `CREATE INDEX index_business_type IF NOT EXISTS FOR (b:Business) ON (b.type);`);
        await runQuery(session, `CREATE INDEX index_business_address IF NOT EXISTS FOR (b:Business) ON (b.address);`);
        await runQuery(session, `CREATE INDEX index_business_phone IF NOT EXISTS FOR (b:Business) ON (b.phone);`);
        await runQuery(session, `CREATE INDEX index_business_email IF NOT EXISTS FOR (b:Business) ON (b.email);`);
        await runQuery(session, `CREATE INDEX index_business_description IF NOT EXISTS FOR (b:Business) ON (b.description);`);
        await runQuery(session, `CREATE INDEX index_business_booking_mode IF NOT EXISTS FOR (b:Business) ON (b.booking_mode);`);

        // Resource 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_resource_id IF NOT EXISTS
            FOR (r:Resource) REQUIRE r.resource_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_resource_business_id IF NOT EXISTS FOR (r:Resource) ON (r.business_id);`);
        await runQuery(session, `CREATE INDEX index_resource_type IF NOT EXISTS FOR (r:Resource) ON (r.type);`);
        await runQuery(session, `CREATE INDEX index_resource_name IF NOT EXISTS FOR (r:Resource) ON (r.name);`);

        // Service 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_service_id IF NOT EXISTS
            FOR (s:Service) REQUIRE s.service_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_service_name IF NOT EXISTS FOR (s:Service) ON (s.name);`);

        // Staff 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_staff_id IF NOT EXISTS
            FOR (st:Staff) REQUIRE st.staff_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_staff_business_id IF NOT EXISTS FOR (st:Staff) ON (st.business_id);`);
        await runQuery(session, `CREATE INDEX index_staff_name IF NOT EXISTS FOR (st:Staff) ON (st.name);`);

        // StaffAvailability 節點
        await runQuery(session, `CREATE INDEX index_staff_availability_staff_id IF NOT EXISTS FOR (sa:StaffAvailability) ON (sa.staff_id);`);
        await runQuery(session, `CREATE INDEX index_staff_availability_day_of_week IF NOT EXISTS FOR (sa:StaffAvailability) ON (sa.day_of_week);`);

        // Booking 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_booking_id IF NOT EXISTS
            FOR (bk:Booking) REQUIRE bk.booking_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_booking_customer_id IF NOT EXISTS FOR (bk:Booking) ON (bk.customer_id);`);
        await runQuery(session, `CREATE INDEX index_booking_business_id IF NOT EXISTS FOR (bk:Booking) ON (bk.business_id);`);
        await runQuery(session, `CREATE INDEX index_booking_service_id IF NOT EXISTS FOR (bk:Booking) ON (bk.service_id);`);
        await runQuery(session, `CREATE INDEX index_booking_time IF NOT EXISTS FOR (bk:Booking) ON (bk.booking_time);`);
        await runQuery(session, `CREATE INDEX index_booking_status IF NOT EXISTS FOR (bk:Booking) ON (bk.status);`);

        // Customer 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_customer_id IF NOT EXISTS
            FOR (c:Customer) REQUIRE c.customer_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_customer_business_id IF NOT EXISTS FOR (c:Customer) ON (c.business_id);`);
        await runQuery(session, `CREATE INDEX index_customer_name IF NOT EXISTS FOR (c:Customer) ON (c.name);`);

        // User 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_user_id IF NOT EXISTS
            FOR (u:User) REQUIRE u.id IS UNIQUE;
        `);
        await runQuery(session, `
            CREATE CONSTRAINT constraint_user_external_id IF NOT EXISTS
            FOR (u:User) REQUIRE u.external_id IS UNIQUE;
        `);
        await runQuery(session, `
            CREATE CONSTRAINT constraint_user_email IF NOT EXISTS
            FOR (u:User) REQUIRE u.email IS UNIQUE;
        `);
        await runQuery(session, `
            CREATE CONSTRAINT constraint_user_phone IF NOT EXISTS
            FOR (u:User) REQUIRE u.phone IS UNIQUE;
        `);

        // BusinessHours 節點
        await runQuery(session, `CREATE INDEX index_business_hours_business_id IF NOT EXISTS FOR (bh:BusinessHours) ON (bh.business_id);`);
        await runQuery(session, `CREATE INDEX index_business_hours_day_of_week IF NOT EXISTS FOR (bh:BusinessHours) ON (bh.day_of_week);`);

        // MembershipLevel 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_membership_level_name IF NOT EXISTS
            FOR (ml:MembershipLevel) REQUIRE ml.level_name IS UNIQUE;
        `);
        await runQuery(session, `
            CREATE CONSTRAINT constraint_membership_business_id IF NOT EXISTS
            FOR (ml:MembershipLevel) REQUIRE ml.business_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_membership_level_id IF NOT EXISTS FOR (ml:MembershipLevel) ON (ml.membership_level_id);`);

        // Advertisement 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_advertisement_id IF NOT EXISTS
            FOR (ad:Advertisement) REQUIRE ad.advertisement_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_advertisement_business_id IF NOT EXISTS FOR (ad:Advertisement) ON (ad.business_id);`);

        // Payment 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_payment_id IF NOT EXISTS
            FOR (p:Payment) REQUIRE p.payment_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_payment_booking_id IF NOT EXISTS FOR (p:Payment) ON (p.booking_id);`);

        // Subscription 節點
        await runQuery(session, `
            CREATE CONSTRAINT constraint_subscription_id IF NOT EXISTS
            FOR (s:Subscription) REQUIRE s.subscription_id IS UNIQUE;
        `);
        await runQuery(session, `CREATE INDEX index_subscription_service_id IF NOT EXISTS FOR (s:Subscription) ON (s.service_id);`);
        await runQuery(session, `CREATE INDEX index_subscription_customer_id IF NOT EXISTS FOR (s:Subscription) ON (s.customer_id);`);

        // 修正已知問題
        console.log('正在修正已知問題...');

        // 1. 修正 BusinessHours.day_of_week 的類型 (從 FLOAT 改為 INTEGER)
        await runQuery(session, `
            MATCH (bh:BusinessHours)
            WITH bh, toInteger(bh.day_of_week) AS integer_day_of_week
            SET bh.day_of_week = integer_day_of_week;
        `);

        // 2. 統一 Staff 和 User 的關係名稱 (使用 HAS_USER_ACCOUNT)
        await runQuery(session, `
            MATCH (st:Staff)-[r:ACCOUNT_FOR_STAFF]->(u:User)
            WHERE NOT (st)-[:HAS_USER_ACCOUNT]->(u)
            MERGE (st)-[:HAS_USER_ACCOUNT]->(u)
            DELETE r;
        `);

        // 獲取最終的約束和索引
        console.log('初始化完成！正在獲取約束和索引列表...');

        const constraints = await runQuery(session, `SHOW CONSTRAINTS;`);
        console.log('約束清單:');
        constraints.forEach(c => {
            // 適應 Neo4j 5.x 的輸出格式
            const name = c.name || c.constraintName || '未命名';
            const desc = c.description || c.details || JSON.stringify(c);
            console.log(` - ${name}: ${desc}`);
        });

        const indexes = await runQuery(session, `SHOW INDEXES;`);
        console.log('索引清單:');
        indexes.forEach(idx => console.log(` - ${idx.name}: ${idx.description}`));

        console.log('Neo4j 資料庫初始化成功完成！');

        try {
            console.log('獲取資料庫模式視圖...');
            // Neo4j 5.x 中可能使用這個 API (如果有支援)
            const schema = await runQuery(session, `CALL apoc.meta.graph;`);
            console.log('資料庫模式已成功獲取。');
            // 可以選擇性地處理 schema 結果，例如打印節點和關係
            // console.log(JSON.stringify(schema, null, 2));
        } catch (error) {
            console.log('無法獲取資料庫模式。您可能需要安裝 APOC 插件:', error.message);
            // 備用選項
            try {
                const nodeLabels = await runQuery(session, `CALL db.labels();`);
                console.log('數據庫中的節點標籤:', nodeLabels.map(l => l.label).join(', '));

                const relTypes = await runQuery(session, `CALL db.relationshipTypes();`);
                console.log('數據庫中的關係類型:', relTypes.map(r => r.relationshipType).join(', '));
            } catch (backupError) {
                console.log('也無法獲取基本結構資訊:', backupError.message);
            }
        }

    } catch (error) {
        console.error('初始化過程中發生錯誤:', error);
    } finally {
        // 關閉會話和驅動
        if (session) {
            await session.close();
        }
        if (driver) {
            await driver.close();
        }
    }
}

// 執行 Cypher 查詢的輔助函數
async function runQuery(session, query) {
    try {
        const result = await session.run(query);
        return result.records.map(record => {
            return record.keys.reduce((obj, key) => {
                obj[key] = record.get(key);
                return obj;
            }, {});
        });
    } catch (error) {
        console.error(`執行查詢時出錯: ${query}`);
        console.error(error);
        throw error;
    }
}

// 執行初始化
initializeNeo4j().catch(error => {
    console.error('執行初始化腳本時發生錯誤:', error);
    process.exit(1);
});
