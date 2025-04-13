# n8n Neo4j 節點開發計劃

## 目前狀態

*   **結構完整**：節點的核心檔案 (`nodes/neo4j/Neo4j.node.ts`)、憑證檔案 (`credentials/Neo4jApi.credentials.ts`)、以及 `actions`, `methods`, `helpers` 目錄下的所有必要檔案骨架都已建立，參考了 `Postgres/devDoc` 的結構。
*   **邏輯骨架**：大部分檔案（特別是 `router.ts`、各個 `*.operation.ts` 檔案、`utils.ts`）目前只包含了基礎結構和從參考範例來的邏輯，尚未針對 Neo4j 的具體需求進行完整實作和測試。

## 下一步開發計劃

為了確保節點功能完善且穩定，建議按照以下步驟進行：

1.  **強化核心工具 (`helpers/utils.ts`)**:
    *   **`runCypherQuery`**: 仔細實作此核心函式，確保：
        *   正確處理讀/寫交易 (`session.executeRead`/`session.executeWrite`)。
        *   正確處理 Cypher 參數。
        *   可靠地轉換 `neo4j-driver` 返回的結果 (包括特殊類型) 為 n8n 需要的 JSON 格式 (使用 `convertNeo4jValueToJs`)。
        *   有效地捕獲和初步處理執行時的錯誤。
    *   **`parseNeo4jError`**: 增強此函式，解析更多錯誤類型，提供更友善的錯誤訊息。
    *   **其他輔助函式**: 檢查並確保 `formatLabels`, `buildPropertiesClause` 等函式的健壯性。

2.  **逐一實作操作邏輯 (`actions/*.operation.ts`)**:
    *   按照 `operations.ts` 中定義的順序 (`executeQuery`, `createNode`, `matchNodes`, `updateNode`, `deleteNode`, `createRelationship`)。
    *   對於每個操作的 `execute` 函式：
        *   確保正確獲取 n8n 參數。
        *   根據參數動態生成正確的 Cypher 查詢。
        *   準備好傳遞給 `runCypherQuery` 的參數物件。
        *   正確呼叫 `runCypherQuery`。
        *   處理結果或錯誤 (結合 `continueOnFail`)。

3.  **完善節點方法 (`methods/*.ts`)**:
    *   **`credentialTest.ts`**: 確保連線測試邏輯完整，錯誤處理清晰。
    *   **`loadOptions.ts`**: 確保查詢標籤、關係類型等的 Cypher 正確，結果轉換無誤，並處理好錯誤。

4.  **整合與測試**:
    *   確保所有 `import` 都已解析。
    *   在 n8n 環境中實際安裝和測試節點。
    *   測試每個操作、邊緣情況、錯誤處理和 `continueOnFail`。
    *   測試憑證測試和動態選項載入。

## 執行流程示意圖 (Mermaid)

```mermaid
graph TD
    A[Neo4j.node.ts .execute()] --> B(actions/router.ts router());
    B --> C{Operation?};
    C -- executeQuery --> D(actions/executeQuery.ts .execute());
    C -- createNode --> E(actions/createNode.ts .execute());
    C -- matchNodes --> F(actions/matchNodes.ts .execute());
    C -- updateNode --> G(actions/updateNode.ts .execute());
    C -- deleteNode --> H(actions/deleteNode.ts .execute());
    C -- createRelationship --> I(actions/createRelationship.ts .execute());
    D --> J(helpers/utils.ts runCypherQuery());
    E --> J;
    F --> J;
    G --> J;
    H --> J;
    I --> J;
    J --> K[Neo4j DB];
    K --> J;
    J --> L[Format Result];
    L --> D;
    L --> E;
    L --> F;
    L --> G;
    L --> H;
    L --> I;
    D --> B;
    E --> B;
    F --> B;
    G --> B;
    H --> B;
    I --> B;
    B --> A;

    subgraph Methods
        M(Neo4j.node.ts .methods) --> N(methods/index.ts);
        N -- credentialTest --> O(methods/credentialTest.ts);
        N -- loadOptions --> P(methods/loadOptions.ts);
        O --> K;
        P --> K;
    end

    style J fill:#f9f,stroke:#333,stroke-width:2px
    style K fill:#ccf,stroke:#333,stroke-width:2px
    style L fill:#ccf,stroke:#333,stroke-width:2px
