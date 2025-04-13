# n8n-nodes-neo4j (繁體中文)

這是一個 n8n 社群節點套件。它讓您可以在 n8n 工作流程中使用 Neo4j 圖形資料庫。

[Neo4j](https://neo4j.com/) 是一個原生的圖形資料庫平台，從底層開始建構，不僅利用資料本身，也利用資料之間的關係。

[n8n](https://n8n.io/) 是一個採用 [fair-code 授權](https://docs.n8n.io/reference/license/) 的工作流程自動化平台。

[安裝](#安裝)
[開發](#開發)
[操作](#操作)
[憑證](#憑證)
[相容性](#相容性)
[資源](#資源)

## 安裝

請遵循 n8n 社群節點文件中的[安裝指南](https://docs.n8n.io/integrations/community-nodes/installation/)。搜尋 `n8n-nodes-neo4j`。

## 開發

本節說明如何設定本地開發環境來開發此節點套件。此方法使用安裝為開發依賴項的 n8n。

### 先決條件

*   **Node.js**: 版本 18.10 或更高 (使用 `node -v` 檢查)。
*   **pnpm**: 版本 9.1 或更高 (使用 `pnpm -v` 檢查)。透過 `npm install -g pnpm` 安裝。

### 設定

1.  **克隆儲存庫：**
    ```bash
    git clone https://github.com/golfamigo/n8n-nodes-neo4jtool.git
    cd n8n-nodes-neo4jtool
    ```

2.  **安裝依賴項：**
    ```bash
    pnpm install
    ```

3.  **建置節點：**
    將 TypeScript 程式碼編譯成 JavaScript 到 `dist` 目錄。
    ```bash
    pnpm run build
    ```

### 本地運行

1.  **啟動 n8n：**
    在專案根目錄運行開發腳本：
    ```bash
    pnpm run dev:n8n
    ```
    n8n 將啟動，使用本地的 `sqlite.db` 檔案進行儲存，並自動從 `dist` 目錄加載您的自訂 Neo4j 節點。請在 `http://127.0.0.1:5678` 訪問 n8n。

### 開發工作流程

1.  **修改** 節點的 TypeScript 原始檔 (位於 `nodes/` 或 `credentials/`)。
2.  **停止** 正在運行的 n8n 實例 (在終端中按 Ctrl+C)。
3.  **重新建置** 節點以編譯您的變更：
    ```bash
    pnpm run build
    ```
4.  使用 `pnpm run dev:n8n` **重新啟動** n8n。

*(提示：您可以在另一個終端中運行 `pnpm run dev`，以便在保存時自動重新編譯 TypeScript 檔案。)*

## 操作

*   **執行 Cypher 查詢 (Execute Cypher Query)**: 對資料庫執行原始的 Cypher 查詢。
*   **建立節點 (Create Node)**: 使用指定的標籤和屬性建立一個新節點。
*   **匹配節點 (Match Nodes)**: 根據標籤和屬性查找節點。
*   **更新節點 (Update Node)**: 根據匹配條件更新現有節點的屬性。
*   **刪除節點 (Delete Node)**: 根據匹配條件刪除節點，可選擇是否先分離關係。
*   **建立關係 (Create Relationship)**: 在兩個匹配的節點之間建立指定類型和可選屬性的關係。

## 憑證

若要使用此節點，您需要在 n8n 中設定 Neo4j 憑證。這需要您 Neo4j 實例的以下資訊：

*   **主機 (Host)**: Neo4j 實例的主機位址，包含協定 (例如 `neo4j://localhost`, `bolt://your-server.com`, `neo4j+s://your-aura-instance.databases.neo4j.io`)。
*   **端口 (Port)**: Neo4j 實例的 Bolt 端口號 (通常是 `7687`)。
*   **資料庫 (Database)**: 要連接的資料庫名稱 (可選，預設為 `neo4j`)。
*   **使用者名稱 (Username)**: 用於 Neo4j 身份驗證的使用者名稱。
*   **密碼 (Password)**: 指定使用者名稱的密碼。

## 相容性

*   最低 n8n 版本: (需要測試，可能 >=1.0)
*   最低 Node.js 版本: >=18.10 (如 `package.json` 所指定)

## 資源

*   [n8n 社群節點文件](https://docs.n8n.io/integrations/community-nodes/)
*   [Neo4j 官方文件](https://neo4j.com/docs/)
