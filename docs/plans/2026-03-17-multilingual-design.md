# Multilingual Support Design — Lebanon Aid Bot
**Date:** 2026-03-17
**Status:** Approved

## Objectif

Ajouter le support complet arabe / anglais / français au bot WhatsApp. La langue est détectée sur le premier message et persistée dans la session KV pour les flux multi-étapes (aide).

## Architecture

### Approche retenue : propagation par paramètre

La langue est détectée une fois dans `webhook.js` et passée en paramètre à chaque fonction. Cohérent avec la façon dont `phoneHash` est déjà propagé. Pas d'état global, pas de singleton.

## Composants

### 1. `src/utils/language.js`
- `detectLanguage(text)` → `'ar' | 'en' | 'fr'`
- Priorité : ar > fr > en
- Arabe : présence d'un caractère `\u0600–\u06FF`
- Français : correspondance de mots-clés (`bonjour`, `aide`, `besoin`, `abri`, `évacuation`, `médecin`, `nourriture`, `couverture`, `menu`)
- Anglais : mots-clés (`shelter`, `help`, `need`, `food`, `hospital`, `evacuate`, `blanket`, `menu`)
- Défaut : `'en'`

### 2. `src/bot/messages.js`
- Remplace les constantes de chaînes dans `responses.js`
- Expose un helper `t(key, lang, ...args)` pour l'accès aux chaînes avec interpolation
- Toutes les chaînes en 3 langues : menu principal, réponses par feature, erreurs, disclaimers
- Arabe : dialecte libanais (inchangé vs `responses.js`)
- Formatters : `formatShelterResult(shelter, distance, lang)` utilise `shelter.name_en ?? shelter.name_ar` (prêt pour futures colonnes Sheet)

### 3. `src/bot/router.js`
- `INTENT_KEYWORDS` enrichi avec mots-clés EN/FR par intent
- `MENU_TRIGGERS` enrichi (`menu`, `help`, `aide`, etc.)
- `detectIntent(text)` reste inchangé en signature

### 4. `api/webhook.js`
- `detectLanguage(text)` appelé en haut de `processIntent`
- `lang` propagé à tous les handlers et formatters
- `responses.js` remplacé par `messages.js` comme source des chaînes

### 5. `src/features/aid.js`
- `handleAid({ phoneHash, text, lang })`
- `lang` stocké dans l'état KV aux côtés de `step`, `name`, `zone`
- Lu depuis l'état KV sur les messages suivants (le flux reste dans la même langue)

### 6. Autres features (`shelter`, `medical`, `evacuation`, `registration`)
- Signature mise à jour : `handleX({ ..., lang })`
- Formatters multilingues appelés avec `lang`

## Modèle de données KV (aid flow)

```json
{
  "step": "ask_zone",
  "name": "Ahmad",
  "zone": null,
  "lang": "fr"
}
```

## Compatibilité Sheet

Les colonnes Sheet actuelles sont `name_ar`, `address_ar`, etc. Les formatters utilisent le pattern `row.name_en ?? row.name_ar` pour être prêts à l'ajout futur de colonnes `name_en`, `name_fr` sans changement de code.

## Tests

- `tests/utils/language.test.js` — détection ar/en/fr, cas limites, défaut
- `tests/bot/messages.test.js` — `t()` helper, interpolation, fallback
- Mise à jour des tests de features existants pour passer `lang`

## Fichiers impactés

| Fichier | Action |
|---|---|
| `src/utils/language.js` | Créer |
| `src/bot/messages.js` | Créer |
| `src/bot/router.js` | Modifier (keywords EN/FR) |
| `api/webhook.js` | Modifier (detectLanguage + propagation) |
| `src/features/aid.js` | Modifier (lang dans KV state) |
| `src/features/shelter.js` | Modifier (param lang) |
| `src/features/medical.js` | Modifier (param lang) |
| `src/features/evacuation.js` | Modifier (param lang) |
| `src/features/registration.js` | Modifier (param lang) |
| `tests/utils/language.test.js` | Créer |
| `tests/bot/messages.test.js` | Créer |
| Tests features existants | Modifier |
