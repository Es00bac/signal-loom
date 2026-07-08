# ショートカットと入力方法

Sloom Studio は、キーボードショートカット、コマンドパレット、ゲームパッド入力に対応しています。本章では、グローバル、Flow ワークスペース、Video ワークスペース、Image Editor ワークスペース、Paper ワークスペースごとに重要なショートカットを整理して説明します。ショートカットは **設定 > Keyboard** でカスタマイズできます。

## 修飾キーの表記

- `Ctrl` は Windows と Linux で使用されます。
- `Cmd` は macOS で使用され、他のプラットフォームの `Ctrl` と同等です。
- `Alt` は Windows と Linux で使用されます。
- `Option` は macOS で使用され、他のプラットフォームの `Alt` と同等です。

本章では、ショートカットを `Ctrl/Cmd+X` のように表記します。これは、Windows/Linux では `Ctrl+X`、macOS では `Cmd+X` を押すことを意味します。

## グローバルショートカット

これらのショートカットは、どのワークスペースからでも動作します。

| アクション | ショートカット |
|--------|----------|
| 新規プロジェクト | `Ctrl/Cmd+N` |
| プロジェクトを開く | `Ctrl/Cmd+O` |
| プロジェクトを保存 | `Ctrl/Cmd+S` |
| 名前を付けて保存 | `Ctrl/Cmd+Shift+S` |
| 元に戻す | `Ctrl/Cmd+Z` |
| やり直し | `Ctrl/Cmd+Y` または `Ctrl/Cmd+Shift+Z` |
| 切り取り | `Ctrl/Cmd+X` |
| コピー | `Ctrl/Cmd+C` |
| 貼り付け | `Ctrl/Cmd+V` |
| 元の位置に貼り付け | `Ctrl/Cmd+Shift+V` |
| すべて選択 | `Ctrl/Cmd+A` |
| 選択解除 | `Ctrl/Cmd+D` または `Esc` |
| 削除 | `Delete` または `Backspace` |
| 設定 | `Ctrl/Cmd+,` |
| コマンドパレット | `Ctrl/Cmd+Shift+P` |
| 全画面表示の切り替え | `F11` または `Ctrl/Cmd+Shift+F` |
| Source Bin の切り替え | `Ctrl/Cmd+B` |
| Inspector の切り替え | `Ctrl/Cmd+I` |
| Activity Trail の切り替え | `Ctrl/Cmd+Shift+A` |
| 次のワークスペース | `Ctrl/Cmd+Tab` |
| 前のワークスペース | `Ctrl/Cmd+Shift+Tab` |
| ヘルプ | `F1` |
| 検索 | `Ctrl/Cmd+F` |

## コマンドパレット

コマンドパレットは `Ctrl/Cmd+Shift+P` で開きます。そこからコマンド名を入力し、`Enter` を押して実行します。パレットは以下をサポートしています。

- ファジーマッチング: コマンド名の単語の一部を入力するだけで検索できます。
- 最近使用したコマンド: 最近使用したコマンドが上部に表示されます。
- ワークスペースフィルタリング: 現在のワークスペース向けのコマンドが優先されます。

便利なパレットコマンドの例:

- `Switch to Flow`
- `Switch to Video`
- `Run Flow`
- `Clean Flow`
- `Import Media`
- `Export Project`
- `Open Settings`
- `Toggle Source Bin`
- `Toggle Bookmarks`
- `Layout Defaults`

## メニューコマンド

メニューコマンドは、Compact または Menubar スタイルのアプリメニューから利用できます。多くのメニュー項目には右側にキーボードショートカットが表示されます。メニューには以下が含まれます。

- **File** — New、Open、Save、Import、Export、Scratch Folder、Recent Projects、Exit。
- **Edit** — Undo、Redo、Cut、Copy、Paste、Delete、Select All、Preferences。
- **View** — Source Bin、Inspector、Bookmarks、Activity Trail、Command Palette、Layout Defaults、Fullscreen。
- **Workspace** — Flow、Video、Image、Paper。
- **Window** — New Window、Close Window、Minimize、Zoom（デスクトップのみ）。
- **Help** — Documentation、Keyboard Shortcuts、OSS Licenses、About。

## Flow ワークスペースのショートカット

| アクション | ショートカット |
|--------|----------|
| Flow を実行 | `Ctrl/Cmd+Enter` |
| Flow を停止 | `Esc` |
| ノードを追加 | `Tab` または `キャンバスをダブルクリック` |
| 中クリック検索 | キャンバスを `中クリック` |
| すべてのノードを選択 | `Ctrl/Cmd+A` |
| ノードをコピー | `Ctrl/Cmd+C` |
| ノードを貼り付け | `Ctrl/Cmd+V` |
| ノードを複製 | `Ctrl/Cmd+D` |
| 選択を削除 | `Delete` または `Backspace` |
| 選択をグループ化 | `Ctrl/Cmd+G` |
| グループ化を解除 | `Ctrl/Cmd+Shift+G` |
| ズームイン | `Ctrl/Cmd+=` |
| ズームアウト | `Ctrl/Cmd+-` |
| 全体表示 | `Ctrl/Cmd+0` |
| キャンバスをパン | `中クリックドラッグ` または `Space ドラッグ` |
| Clean Flow | `Ctrl/Cmd+Shift+L` |
| 選択ノードを強制実行 | `Ctrl/Cmd+R` |
| ノードブックマークの切り替え | `Ctrl/Cmd+D` |
| Source Bin の切り替え | `Ctrl/Cmd+B` |

## Video ワークスペースのショートカット

| アクション | ショートカット |
|--------|----------|
| 再生 / 一時停止 | `Space` |
| シャトル逆再生 | `J` |
| シャトル停止 | `K` |
| シャトル順再生 | `L` |
| 1 フレーム戻る | `Left Arrow` |
| 1 フレーム進む | `Right Arrow` |
| 先頭へ移動 | `Home` |
| 末尾へ移動 | `End` |
| In を設定 | `I` |
| Out を設定 | `O` |
| In をクリア | `Alt+I` |
| Out をクリア | `Alt+O` |
| 挿入 | `,`（コンマ） |
| 上書き | `.`（ピリオド） |
| 選択ツール | `V` |
| カット / カミソリツール | `C` |
| スリップツール | `Y` |
| ハンドツール | `H` |
| スナップの切り替え | `S` |
| 再生ヘッド位置で分割 | `C`（選択ツール時） |
| リップルトリム先頭 | `Q` |
| リップルトリム末尾 | `W` |
| ロール編集 | `E` |
| マーカーを追加 | `M` |
| クリップを微調整 | `矢印キー` |
| 10 フレーム微調整 | `Shift+矢印` |

## Image Editor ワークスペースのショートカット

| アクション | ショートカット |
|--------|----------|
| Move | `V` |
| Hand | `H` |
| Marquee | `M` |
| Lasso | `L` |
| Magic Wand | `W` |
| Quick Mask | `Q` |
| Brush | `B` |
| Eraser | `E` |
| Background Eraser | `Alt+E` |
| Magic Eraser | `Shift+E` |
| Clone Stamp | `S` |
| Spot Heal | `J` |
| Blur | `R` |
| Sharpen | `Shift+R` |
| Smudge | `U` |
| Dodge | `O` |
| Burn | `Shift+O` |
| Sponge Saturate | `P` |
| Sponge Desaturate | `Shift+P` |
| Paint Bucket | `G` |
| Gradient | `Shift+G` |
| Pen | `Shift+B` |
| Rectangle | `X` |
| Ellipse | `Shift+X` |
| Crop | `C` |
| Text | `T` |
| Eyedropper | `I` |
| ブラシサイズを小さく | `[` |
| ブラシサイズを大きく | `]` |
| 硬度を下げる | `{` |
| 硬度を上げる | `}` |
| 前景色で塗りつぶし | `Alt+Delete` / `Option+Delete` |
| 背景色で塗りつぶし | `Ctrl+Delete` / `Cmd+Delete` |
| 自由変形 | `Ctrl/Cmd+T` |
| 選択解除 | `Ctrl/Cmd+D` |
| 選択範囲を反転 | `Ctrl/Cmd+Shift+I` |
| 新規レイヤー | `Ctrl/Cmd+Shift+N` |
| レイヤーをグループ化 | `Ctrl/Cmd+G` |
| 下のレイヤーとマージ | `Ctrl/Cmd+E` |

## Paper ワークスペースのショートカット

| アクション | ショートカット |
|--------|----------|
| Select | `V` |
| Hand | `H` |
| Text | `T` |
| Image | `Shift+I` |
| Eyedropper | `I` |
| Gutter Knife | `K` |
| Duplicate | `Ctrl/Cmd+D` |
| Group | `Ctrl/Cmd+G` |
| Ungroup | `Ctrl/Cmd+Shift+G` |
| Lock | `Ctrl/Cmd+L` |
| Unlock | `Ctrl/Cmd+Shift+L` |
| 微調整 | `矢印キー` |
| 10 倍微調整 | `Shift+矢印` |
| 背面へ | `Ctrl/Cmd+[` |
| 前面へ | `Ctrl/Cmd+]` |
| 最背面へ | `Ctrl/Cmd+Shift+[` |
| 最前面へ | `Ctrl/Cmd+Shift+]` |
| ガイドの切り替え | `Ctrl/Cmd+;` |
| グリッドの切り替え | `Ctrl/Cmd+'` |
| ページを全体表示 | `Ctrl/Cmd+0` |
| ズームイン | `Ctrl/Cmd+=` |
| ズームアウト | `Ctrl/Cmd+-` |
| 改ページ | `Ctrl/Cmd+Return`（テキスト内） |
| プレビューモードの切り替え | `W` |

## ゲームパッドの基本

Sloom Studio は、ナビゲーション、再生、一部の編集アクションにゲームパッド入力に対応しています。デフォルトの割り当てはワークスペースによって異なります。

### グローバルゲームパッドデフォルト

| コントロール | アクション |
|---------|--------|
| 左スティック | ビューポートをパン |
| 右スティック | ズーム / スクラブ |
| A / Cross | 確定 / 選択 |
| B / Circle | キャンセル / 選択解除 |
| X / Square | コンテキストメニュー |
| Y / Triangle | コマンドパレット |
| 左ショルダー | 前のアイテム / フレーム |
| 右ショルダー | 次のアイテム / フレーム |
| 左トリガー | 速度を下げる |
| 右トリガー | 速度を上げる |
| 方向パッド | 選択を微調整 |
| Start | 再生 / 一時停止 |
| Select | Source Bin の切り替え |

ゲームパッドの割り当ては **設定 > ゲームパッド** でカスタマイズできます。すべてのアクションがゲームパッドで利用できるわけではありません。

## ショートカットのカスタマイズ

1. **設定 > Keyboard** を開きます。
2. 変更したいコマンドを検索します。
3. 現在のショートカットをクリックします。
4. 新しいキー組み合わせを押します。
5. 保存します。

ショートカットが別のコマンドと競合する場合、両方のエントリがハイライトされます。一方を変更して競合を解決してください。

## ショートカットのインポートとエクスポート

Settings の Backup タブを使用して、キーボードとゲームパッドの割り当てをエクスポートおよびインポートできます。これは、マシン間やチームメンバー間で設定を共有するのに便利です。

## アクセシビリティ

Sloom Studio は、ほとんどのタスクをキーボードのみで操作できることを目指しています。メニューとダイアログは `Tab`、`Shift+Tab`、`Enter`、`Esc` で操作できます。コマンドパレットは、ほとんどの機能への最速のキーボードパスです。

## OS とのショートカット競合

一部のショートカットは OS のデフォルトと競合する可能性があります。ショートカットが動作しない場合:

- **設定 > Keyboard** で割り当てを確認してください。
- 他のアプリケーションがそのショートカットを横取りしていないか確認してください。
- macOS では、`Cmd+Space` や `Cmd+Tab` などのショートカットが予約されていることがあります。
- Linux では、ウィンドウマネージャーが `Alt` ショートカットを横取りすることがあります。

最新のショートカットデフォルトについては、アプリ内の Keyboard 設定ページを確認してください。
