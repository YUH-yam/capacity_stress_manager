# Capacity & Stress Manager

日々のタスク負荷、WBS、ストレスケアをまとめて管理する、Google Sheets連携対応のHTMLアプリです。

## Grand Design

このアプリは「日々の負荷をすばやく把握し、必要な調整に移るためのiOSファースト業務アプリ」として設計しています。

SPでは片手操作と素早い切り替えを優先し、主要機能を下部タブに集約します。PCでは同じトーンを保ちながら、広い画面を活かした管理画面として表示します。

## Design Principles

- SPはiOSアプリ、PCは管理画面として最適化する
- SPの主要タブは5つ以内に収める
- 重要情報は「今日・今週・緊急・ケア」を最上位に置く
- タップ可能なUIは原則44px以上にする
- ナビゲーションとコンテンツカードを明確に分ける
- WBSはPCではタイムライン、SPではカテゴリ別カードで表示する
- 配色は白・明るいグレー・iOSブルーを基調にし、注意色は赤/オレンジ、良好/完了は緑に限定する

## File Structure

```text
.
├── index.html
├── manifest.json
├── sw.js
└── assets
    ├── css
    │   ├── 00-foundation.css
    │   ├── 01-stress.css
    │   ├── 02-tasks-settings.css
    │   ├── 03-wbs.css
    │   ├── 04-sync.css
    │   ├── 05-responsive.css
    │   ├── 06-print-utilities.css
    │   └── 07-ios-first.css
    ├── icons
    │   └── icon.svg
    └── js
        ├── 00-sync.js
        ├── 01-data-catalogs.js
        ├── 02-state-storage.js
        ├── 03-dashboard.js
        ├── 04-tasks.js
        ├── 05-drag-drop.js
        ├── 06-wbs.js
        ├── 07-stress.js
        ├── 08-export.js
        └── 09-bootstrap.js
```

## Usage

1. `index.html` をブラウザで開きます。
2. PWAとして使う場合は、HTTPS配信またはローカルHTTP配信で開いてホーム画面に追加します。
3. Google Sheets連携を使う場合は、アプリ内の「その他」から出力設定を開き、GAS Web App URLを保存します。

## Google Sheets / GAS

現在の保存形式はGAS側のA1単一セルJSON保存に対応しています。既存のGAS Scriptは変更不要です。

旧形式データも読み込めるよう、HTML側で以下を吸収します。

- 旧 `deadline` を `endDate` として扱う
- 旧ストレススコアを新しい5段階評価に変換する
- `schemaVersion` や `catalogs` がない旧データも読み込む

## WBS Rules

WBSの期間表示は以下の基準です。

- 開始: 開始日の0:00
- 終了: 終了日の23:59
- PC: 横長タイムライン
- SP: カテゴリ別カードと短い期間バー

## Capacity Calculation

ダッシュボードやWBSで表示する「割当工数」は、タスクの進捗率を反映した残り工数として計算します。

```text
割当工数 = 工数 × (100 - 進捗率) / 100
```

例: 工数10.0h、進捗率60%の場合、割当工数は4.0hです。

## Deployment Notes

ファイルを配置するときは、ZIP内の階層を保ったまま全ファイルを差し替えてください。

Service Workerのキャッシュ名は `sw.js` 内の `CACHE_NAME` で管理しています。HTML/CSS/JSを更新した場合は、キャッシュ名と `index.html` のクエリパラメータを更新してください。

## Local Check

ローカルHTTPで確認する場合:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

その後、ブラウザで開きます。

```text
http://127.0.0.1:8765/index.html
```

## References

- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Tab bars: https://developer.apple.com/design/human-interface-guidelines/tab-bars/
- Designing for iOS: https://developer.apple.com/jp/design/human-interface-guidelines/designing-for-ios
- Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
