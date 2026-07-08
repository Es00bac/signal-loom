# Japanese Translation Assessment

This chapter assesses the quality, coverage, and consistency of the Japanese localization in Sloom Studio. The assessment is based on the current translation inventories and observed UI strings. It assigns an overall grade, presents coverage statistics, gives examples of good and problematic translations, discusses Japanese typography support, and provides concrete recommendations.

## Overall Score

- **App chrome and core UI:** **B+**
- **Data-driven UI and specialized registries:** **C+**
- **Japanese typography features:** **A-**
- **Overall:** **B**

The Japanese translation is functional and professional in the shared application chrome. Users can navigate menus, dialogs, settings, and common workspace commands in Japanese without confusion. However, many data registries—provider options, tool labels, preflight statuses, and template names—remain in English. This creates a mixed-language experience that reduces polish and may confuse users who expect a fully localized interface.

## Coverage Statistics

| Registry | Total Strings | Translated | Coverage |
|----------|--------------|------------|----------|
| `i18n.ts` catalog | 677 | 677 | 100% |
| `workspaceMenus.json` | 246 | 245 | 99.6% |
| `nodeCatalog` | ~83 | ~83 | ~100% |
| `paperUsabilityActions` | 73 | 73 | 100% |

The high coverage numbers for the core catalogs are commendable. They indicate that the localization effort was systematic and that few core labels were missed. The real gap is not in the counted catalogs but in the many data registries that were not part of the localization pass.

## Examples of Good Translations

The Japanese localization excels in areas that require domain knowledge of design, print, and comics production. Examples include:

| English | Japanese | Notes |
|---------|----------|-------|
| Bleed | 裁ち落とし | Correct DTP term. |
| Spreads | 見開き | Natural and immediately understandable. |
| Leading | 行送り | Better than the katakana loanword; appropriate for Japanese layout. |
| Tracking | 字送り | Similarly well chosen. |
| Ruby / Furigana | ルビ | Standard term. |
| Emphasis dots | 圏点 | Correct typography term. |
| Tate-chu-yoko | 縦中横 | Correct and expected term. |
| Vertical writing | 縦書き | Correct. |
| Kinsoku shori | 禁則処理 | Correct and important for Japanese composition. |
| Binding direction | 右綴じ / 左綴じ | Correctly distinguishes RTL and LTR binding. |

These examples show that the localization team understood Japanese publishing terminology. A native reader working on manga, book design, or print will recognize these terms and trust the application.

## Examples of Awkward or Inappropriate Translations

Several translations feel like direct machine output or literal loanword choices rather than natural Japanese UI copy.

| English | Japanese | Issue |
|---------|----------|-------|
| Pretty | きれい | Too casual and vague for a design or effect label. A more specific term such as 綺麗, 美麗, or a functional description would be better. |
| Middle align | 中段 | In typography this usually means vertical center alignment; 中央揃え or 中央寄せ is more standard. |
| Bounding box | バウンディングボックス | Common in 3D software, but in 2D layout 境界ボックス or 枠 would feel more natural. |
| Star item | アイテムにスター | Ungrammatical. Prefer アイテムにスターを付ける or スター付きアイテム. |
| Estimator | エスティメーター | Understandable, but 見積 or コスト見積 is clearer in this context. |
| Organic | オーガニック | Often refers to food in Japanese. In design contexts, 有機的 or a shape-specific term is better. |

These awkward strings appear mostly in data registries and tool labels rather than the core `i18n.ts` catalog. They do not block usage, but they make the application feel less polished and occasionally confusing.

## Examples of Missing or English-Only Localization

Many specialized registries are still predominantly English. Users who select Japanese will see English labels in these areas:

| Registry / Area | Typical English Examples Seen |
|-----------------|------------------------------|
| Provider catalog options | Model names, endpoint descriptions, capability labels. |
| Image node templates | Operation labels such as "inpaint," "outpaint," "remove background." |
| Image provider capabilities help cards | English explanatory text and tooltips. |
| Paper preflight status labels | "Missing font," "Low resolution image," "Overprint issue." |
| Paper document guide labels | Guide names and preset descriptions. |
| Paper bubble presets | Preset names like "Speech Bubble Round," "Thought Cloud." |
| Image editor tool labels | Some tool names and options remain in English. |
| Command palette app entries | Provider-specific and registry-driven entries. |

The pattern is consistent: static, hand-authored strings are translated; dynamic, registry-driven strings are not. This is a common situation in applications where the UI builds itself from JSON or TypeScript data files, but it should be addressed for a truly complete localization.

## Japanese Typography Features

Sloom Studio's Japanese typography support is a strength. The following features are localized and behave correctly:

- **Ruby / Furigana (ルビ):** Input syntax `漢字《かんじ》` is supported and rendered.
- **Emphasis dots (圏点):** Input syntax `《《強調》》` is supported with selectable dot styles.
- **Tate-chu-yoko (縦中横):** Horizontal runs inside vertical text are supported.
- **Vertical writing (縦書き):** Text frames can switch to vertical flow.
- **Kinsoku shori (禁則処理):** Line-breaking rules are applied to Japanese text.
- **Binding direction (右綴じ):** Right-to-left binding is supported for books and manga.

These features are not just translated; they are implemented with the correct behavior. This is the area where the localization is strongest.

## Consistency Issues

Beyond coverage, there are consistency issues that a native proofreader should address:

### Loanword Style

Some terms use katakana loanwords while nearby terms use native Japanese equivalents. For example:

- バウンディングボックス next to 裁ち落とし feels mismatched.
- エスティメーター next to 見積-based terms in other panels.

The application should choose a loanword policy and apply it consistently. A good rule is:

- Use well-established loanwords for tools and UI concepts (ブラシ, レイヤー, ノード).
- Use native or Sino-Japanese terms for domain concepts where they exist (裁ち落とし, 禁則処理).
- Avoid loanwords that have a different common meaning in Japanese (オーガニック).

### Verb Form and Grammar

Some strings mix plain-form and polite-form instructions, or use noun phrases where verbs are expected. For example, アイテムにスター is a noun phrase where an action label should be a verb phrase. A style guide should define whether menu items, buttons, and tooltips use verbs, nouns, or short phrases.

### Capitalization and Punctuation

English registry entries often retain title case or sentence case. In Japanese UI, consistency of katakana spacing, half-width vs full-width punctuation, and parentheses style matters. A native editor should standardize these.

## Recommendations

1. **Native Proofread the Core Catalogs**
   The `i18n.ts`, `workspaceMenus.json`, and `nodeCatalog` translations are nearly complete but would benefit from a native proofreader focusing on consistency, register, and loanword choice.

2. **Localize Data Registries**
   The biggest gap is in JSON/TypeScript data registries. Add a localization layer so that provider options, image node templates, image provider capability help cards, Paper preflight labels, Paper document guide labels, Paper bubble presets, and image editor tool labels can have Japanese versions.

3. **Apply a Loanword Style Guide**
   Decide when to use katakana loanwords and when to use native terms. Document the decisions and apply them across all registries. Audit terms such as エスティメーター, オーガニック, and バウンディングボックス.

4. **Fix Grammar and Register**
   Replace noun-phrase labels with appropriate verbs where actions are implied. Standardize politeness level across menus, dialogs, and tooltips.

5. **Extend i18n Tests**
   Add automated tests that verify every registry string has a Japanese entry, or at least fails gracefully with a fallback. The current tests cover the main catalogs well; extend them to the data registries.

6. **Contextual Screenshots for Translators**
   Provide translators with screenshots of where each string appears. Some awkward translations likely occur because the translator did not see the surrounding UI.

7. **User Feedback Loop**
   Add a lightweight in-app feedback mechanism for translation issues. Japanese users are often the best source of corrections for niche terms like 裁ち落とし vs ブリード.

8. **Document Terminology**
   Create a Japanese terminology glossary for Sloom Studio. Include preferred translations for DTP, video, image editing, and AI terms. This will keep future translations consistent.

## Conclusion

Sloom Studio's Japanese localization is solid enough for daily use, especially for users who work with Japanese typography and comics. The core UI is well translated, and the Japanese-specific features are correctly named and implemented. The main weakness is the large set of data registries that remain in English, plus a handful of awkward or overly literal translations. With a focused pass on data registry localization, native proofreading, and a consistent style guide, the overall grade could rise from B to A- or higher.
