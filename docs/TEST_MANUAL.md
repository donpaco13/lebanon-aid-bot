# Test Manuel — Bot WhatsApp Lebanon Aid

> Guide de test end-to-end depuis WhatsApp.
> Code source : `api/webhook.js`, `src/features/`, `src/bot/messages.js`.
> Date de mise à jour : 2026-03-26

---

## Prérequis

- Numéro WhatsApp connecté au sandbox Twilio (ou numéro prod).
- Variables d'env configurées : `TWILIO_AUTH_TOKEN`, `GOOGLE_SHEETS_ID`, `VERCEL_KV_*`.
- Pour réinitialiser complètement l'état : envoyer `reset`.

---

## Commandes universelles

Ces commandes fonctionnent **depuis n'importe quel état**, même en cours de flow, même si le rate limit est atteint.

| Envoyer | Effet |
|---------|-------|
| `0` | Menu principal dans la langue stockée |
| `menu` | Idem |
| `قائمة` | Idem (arabe) |
| `retour` | Idem (français) |
| `language` | Relance l'onboarding trilingue, efface la langue stockée |
| `langue` | Idem (français) |
| `لغة` | Idem (arabe) |
| `english` | Passe en anglais sans onboarding, affiche le menu EN |
| `français` / `francais` | Passe en français, affiche le menu FR |
| `reset` | Efface tout (lang + onboarding + aid flow), relance onboarding |

---

## Onboarding (premier contact ou après `reset`/`language`)

### Message envoyé
```
reset
```
*(ou n'importe quel message depuis un numéro inconnu)*

### Réponse attendue
```
مرحباً 🇱🇧 اختر لغتك:
Hello 🌍 Choose your language:
Bonjour 🇫🇷 Choisissez votre langue:

1️⃣ العربية
2️⃣ English
3️⃣ Français
```
> Pas de footer NAV sur ce message.

### Choix de langue

| Envoyer | Langue active | Réponse attendue |
|---------|--------------|-----------------|
| `1` | Arabe | Menu en arabe + footer AR |
| `2` | Anglais | Menu en anglais + footer EN |
| `3` | Français | Menu en français + footer FR |
| Autre chose | — | Onboarding répété |

---

## Option 1 — Abris proches (Shelter)

### Déclencheurs

| Langue | Messages valides |
|--------|-----------------|
| AR | `1`, `ملاجئ`, `ملجأ`, `مأوى`, `وين نام` |
| EN | `1`, `shelter` |
| FR | `1`, `abri` |
| Toutes | Envoyer une localisation GPS 📍 |

### Réponse attendue (données disponibles)

```
🏠 [Nom de l'abri]
📍 [Adresse]
🛏️ [Langue] Available spots: [N]
📏 [X.X] km          ← uniquement si localisation GPS envoyée

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```
> Plusieurs abris peuvent s'afficher, séparés par une ligne vide.

### Réponse attendue (cache périmé — données > 15 min)

```
⚠️ This information was last verified at HH:MM UTC

🏠 [Nom de l'abri]
...
```

### Réponse attendue (aucun résultat pour cette zone)

- AR : `ما لقيت نتائج لهيدي المنطقة. جرّب اسم تاني أو ابعتلي موقعك 📍`
- EN : `No results found for this area. Try a different name or send your location 📍`
- FR : `Aucun résultat pour cette zone. Essayez un autre nom ou envoyez votre position 📍`

### Réponse attendue (Sheets inaccessible, pas de cache)

```
⚠️ [liste de numéros d'urgence]
```

---

## Option 2 — Avertissements d'évacuation

### Déclencheurs

| Langue | Messages valides |
|--------|-----------------|
| AR | `2`, `إخلاء`, `هرب`, `خطر` |
| EN | `2`, `evacuate`, `evacuation` |
| FR | `2`, `évacuation`, `evacuation` |

### Réponse attendue (évacuation active)

```
🔴 [Zone] : Immediate evacuation
➡️ [Direction]

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

### Réponse attendue (situation stable)

```
🟢 [Zone] : Situation stable
```

### Réponse attendue (aucun avertissement en cours)

- AR : `ما في تحذيرات إخلاء حاليًا ✅`
- EN : `No evacuation warnings at this time ✅`
- FR : `Aucun avertissement d'évacuation en ce moment ✅`

### Réponse attendue (cache périmé — données > 5 min)

```
⚠️ This information was last verified at HH:MM UTC
🔴 ...
```

---

## Option 3 — Hôpitaux en service (Medical)

### Déclencheurs

| Langue | Messages valides |
|--------|-----------------|
| AR | `3`, `مستشفى`, `طبيب`, `دوا`, `مستشفيات` |
| EN | `3`, `hospital`, `doctor`, `medicine` |
| FR | `3`, `hôpital`, `hopital`, `médecin`, `medecin` |

### Réponse attendue (données disponibles)

```
🏥 [Nom hôpital]
🟢 Operational
📍 [Adresse]
📏 [X.X] km          ← si localisation envoyée
⚠️ Last verified: HH:MM

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

**Statuts possibles :**
| Statut | AR | EN | FR |
|--------|----|----|-----|
| operational | 🟢 شغّال | 🟢 Operational | 🟢 En service |
| limited | 🟡 محدود | 🟡 Limited | 🟡 Limité |
| closed | 🔴 مسكّر | 🔴 Closed | 🔴 Fermé |
| destroyed | ⛔ مدمّر | ⛔ Destroyed | ⛔ Détruit |

### Réponse attendue (cache périmé — données > 10 min)

```
⚠️ This information was last verified at HH:MM UTC
🏥 ...
```

---

## Option 4 — Demande d'aide (Aid flow)

> Flow stateful — 4 étapes. État stocké en KV (TTL 10 min, clé `aid:hash`).
> `0` ou `قائمة` annule le flow à tout moment.

### ⚠️ Note bug corrigé

`NEED_MAP` option 4 était inconsistant avec le menu affiché.
Valeurs correctes après correction :
- EN : `Something else` (était `Other`)
- FR : `Autre chose` (était `Autre`)

### Arabe 🇱🇧

**Étape 0 — Déclencher**
Envoyer : `4`
```
شو اسمك؟

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```

**Étape 1 — Nom**
Envoyer : `أحمد`
```
وين موجود/ة؟ (اسم المنطقة)

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```

**Étape 2 — Zone**
Envoyer : `الحمرا`
```
شو محتاج/ة؟
1️⃣ أكل
2️⃣ فرشات / حرامات
3️⃣ دوا
4️⃣ شي تاني

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```

**Étape 3 — Besoin**
Envoyer : `1` (ou `2`, `3`, `4`, ou multi ex. `1,3`)
```
✅ تم تسجيل طلبك — رقم التذكرة: AID-XXXXXXX
رح يتواصل معك متطوع بأقرب وقت.

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```

---

### Anglais 🇬🇧

**Étape 0 — Déclencher**
Envoyer : `4`
```
What is your name?

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

**Étape 1 — Nom**
Envoyer : `Ahmad`
```
Where are you located? (area name)

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

**Étape 2 — Zone**
Envoyer : `Hamra`
```
What do you need?
1️⃣ Food
2️⃣ Blankets
3️⃣ Medicine
4️⃣ Something else

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

**Étape 3 — Besoin**
Envoyer : `1`
```
✅ Your request has been registered — ticket: AID-XXXXXXX
A volunteer will contact you shortly.

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

---

### Français 🇫🇷

**Étape 0 — Déclencher**
Envoyer : `4`
```
Quel est votre prénom ?

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

**Étape 1 — Nom**
Envoyer : `Ahmad`
```
Où êtes-vous ? (nom de la zone)

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

**Étape 2 — Zone**
Envoyer : `Hamra`
```
De quoi avez-vous besoin ?
1️⃣ Nourriture
2️⃣ Couvertures
3️⃣ Médicaments
4️⃣ Autre chose

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

**Étape 3 — Besoin**
Envoyer : `3`
```
✅ Votre demande a été enregistrée — ticket : AID-XXXXXXX
Un bénévole vous contactera dès que possible.

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

---

### Multi-besoins et cas limites

| Envoyer au besoin | Valeur stockée dans ticket |
|-------------------|---------------------------|
| `1` | Food / أكل / Nourriture |
| `2` | Blankets / فرشات / حرامات / Couvertures |
| `3` | Medicine / دوا / Médicaments |
| `4` | Something else / شي تاني / Autre chose |
| `1,3` | Food, Medicine |
| `1 2 3` | Food, Blankets, Medicine |
| `1 1 2` | Food, Blankets (dédupliqué) |
| texte libre (ex. `j'ai besoin de tout`) | le texte brut |

---

## Option 5 — Enregistrement comme déplacé (Registration)

### Déclencheurs

| Langue | Messages valides |
|--------|-----------------|
| AR | `5`, `تسجيل`, `نازح`, `اتسجل` |
| EN | `5`, `register`, `displaced` |
| FR | `5`, `enregistrer` |

### Réponse attendue

Une liste d'étapes administratives (lues depuis le Sheet `registration`) :

```
📋 Step 1: [Texte de l'étape]
📄 Documents: [Liste des documents]
🔗 [Lien optionnel]

📋 Step 2: ...

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```
> Le contenu exact dépend des données dans le Sheet `registration`.

---

## Cas d'erreur généraux

| Situation | Réponse attendue |
|-----------|-----------------|
| Sheets inaccessible, pas de cache | `⚠️` + liste numéros urgence (EMERGENCY_FALLBACK) |
| Sheets en chargement, cache vide | `🔄 Data is being loaded...` (DATA_LOADING) |
| Trop de messages | `⚠️ You are sending too many messages...` (RATE_LIMITED) |
| Erreur interne | `⚠️ Unable to retrieve information right now...` (ERROR_SHEETS_DOWN) |

---

## Checklist de vérification post-test

### Option 4 (Aid) uniquement

- [ ] Ticket reçu dans la réponse WhatsApp (format `AID-XXXXXX`)
- [ ] Bénévoles `on_duty=true` ont reçu la notification (vérifier leur WhatsApp)
- [ ] Log `aid_request_submitted` visible dans Vercel Logs
- [ ] Ligne ajoutée dans l'onglet `aid_requests` du Google Sheet

### Toutes options

- [ ] Footer NAV affiché (sauf onboarding)
- [ ] Langue correcte dans toute la réponse
- [ ] `0` retourne bien au menu depuis chaque étape
