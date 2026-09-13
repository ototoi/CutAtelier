# Cut Atelier

映像を見て、指し示し、触って直すためのローカルMV制作・レビュー支援ツールです。カット管理、フレームへの指摘、修正依頼、候補テイクの採用履歴を一つの画面にまとめます。

## 現在できること

- プロジェクトとカットの作成、カット設定・順序の変更
- ローカル動画・画像のテイク登録とブラウザ再生
- 動画上の矩形、フレーム範囲、分類、維持事項を含む指摘
- 未解決指摘とカット情報を固定した修正依頼の作成
- 候補テイクの採用と履歴保存
- SQLiteへの永続化と、古い画面からの競合更新の拒否

同期A/B比較、編集版プレビュー、分割・統合・Undo、FFmpegワーカー、ComfyUI連携は次段階です。

## 起動

Node.js 22.13以上が必要です。このPCではnodenv用に `.node-version` を同梱しています。

```sh
npm install
npm run dev -- --host 127.0.0.1
```

ブラウザで `http://127.0.0.1:5173` を開きます。データベースは既定で `data/cutatelier.db` に作成され、Git管理されません。

LAN内へ公開する場合は、接続トークンとブラウザから到達するURLを指定します。

```sh
CUT_ATELIER_TOKEN='十分長いランダムな値' npm run dev -- --host 0.0.0.0
```

本番ビルドでは `CUT_ATELIER_TOKEN` に加え、`ORIGIN=http://このPCのLANアドレス:3000` を設定します。インターネットへの直接公開は対象外です。

## 検証

```sh
npm run check
npm run lint
npm test
npm run build
```

本番ビルドは `HOST=127.0.0.1 PORT=3000 node build` で起動できます。

## ドキュメント

- [実装計画](docs/IMPLEMENTATION_PLAN.md)
- [設計書](docs/DESIGN.md)
- [MV制作方針](docs/PRODUCTION_WORKFLOW.md)

設計は `minimax-h3-setup` での検討から引き継ぎました。「黎明シグナル」の制作は中断中で、素材は元の場所に保持しています。本リポジトリでのツール実装は制作再開を意味しません。
