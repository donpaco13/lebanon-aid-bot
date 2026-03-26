# Test Manuel — Flow "Demande d'aide" (Option 4)

> Ce document permet de tester manuellement le flow complet depuis WhatsApp.
> Testé contre le code dans `src/features/aid.js` + `api/webhook.js`.

---

## ⚠️ Bug connu — Google Sheets non écrit

**`appendRow` n'est jamais appelé pour les demandes d'aide en production.**
Les données sont loggées (`logger.info`) et les bénévoles sont notifiés (WhatsApp),
mais **rien n'est écrit dans l'onglet `aid_requests` du Google Sheet**.
À corriger avant la mise en prod : appeler `sheets.appendRow('aid_requests', {...})` dans `aid.js` à l'étape `ask_need`.

---

## Prérequis

1. Avoir un compte WhatsApp connecté au sandbox Twilio (ou numéro prod).
2. Avoir complété l'onboarding (choix de langue). Si non : envoyer n'importe quel message → onboarding s'affiche.
3. Pour réinitialiser complètement : envoyer `reset`.

---

## Onboarding (premier message ou après `reset`)

### Message envoyé (n'importe quoi, ou `reset`)
```
reset
```

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
| Envoyer | Langue active |
|---------|--------------|
| `1`     | Arabe        |
| `2`     | Anglais      |
| `3`     | Français     |

---

## Flow complet — Arabe 🇱🇧

### Étape 0 — Déclencher le flow
**Envoyer :** `4`

**Réponse attendue :**
```
شو اسمك؟

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```

---

### Étape 1 — Donner son nom
**Envoyer :** `أحمد` *(ou n'importe quel prénom)*

**Réponse attendue :**
```
وين موجود/ة؟ (اسم المنطقة)

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```

---

### Étape 2 — Donner sa zone
**Envoyer :** `الحمرا` *(ou n'importe quelle zone)*

**Réponse attendue :**
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

---

### Étape 3 — Choisir le besoin
**Options à tester :**

| Envoyer | Besoin enregistré        |
|---------|--------------------------|
| `1`     | أكل                      |
| `2`     | فرشات / حرامات           |
| `3`     | دوا                      |
| `4`     | شي تاني                  |
| `1,3`   | أكل, دوا (multi-besoins) |
| `1 2 3` | أكل, فرشات / حرامات, دوا |
| texte libre | le texte brut (si aucun chiffre 1-4) |

**Réponse attendue (ex. besoin `1`) :**
```
✅ تم تسجيل طلبك — رقم التذكرة: AID-XXXXXXX
رح يتواصل معك متطوع بأقرب وقت.

─────
0️⃣ القائمة في أي وقت
🌐 تغيير اللغة: "لغة"
```
> Le numéro de ticket est au format `AID-` + timestamp base36, ex. `AID-M8KJ2F`.
> Après cette réponse, les bénévoles `on_duty=true` reçoivent une notification WhatsApp.

---

## Flow complet — Anglais 🇬🇧

### Étape 0 — Déclencher le flow
**Envoyer :** `4`

**Réponse attendue :**
```
What is your name?

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

---

### Étape 1 — Donner son nom
**Envoyer :** `Ahmad`

**Réponse attendue :**
```
Where are you located? (area name)

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

---

### Étape 2 — Donner sa zone
**Envoyer :** `Hamra`

**Réponse attendue :**
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

---

### Étape 3 — Choisir le besoin
**Réponse attendue (ex. besoin `2`) :**
```
✅ Your request has been registered — ticket: AID-XXXXXXX
A volunteer will contact you shortly.

─────
0️⃣ Main menu anytime
🌐 Change language: "language"
```

---

## Flow complet — Français 🇫🇷

### Étape 0 — Déclencher le flow
**Envoyer :** `4`

**Réponse attendue :**
```
Quel est votre prénom ?

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

---

### Étape 1 — Donner son nom
**Envoyer :** `Ahmad`

**Réponse attendue :**
```
Où êtes-vous ? (nom de la zone)

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

---

### Étape 2 — Donner sa zone
**Envoyer :** `Hamra`

**Réponse attendue :**
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

---

### Étape 3 — Choisir le besoin
**Réponse attendue (ex. besoin `3`) :**
```
✅ Votre demande a été enregistrée — ticket : AID-XXXXXXX
Un bénévole vous contactera dès que possible.

─────
0️⃣ Menu principal à tout moment
🌐 Changer de langue : "langue"
```

---

## Cas limites à tester

| Scénario | Envoyer | Comportement attendu |
|----------|---------|----------------------|
| Annuler en cours de flow | `0` ou `قائمة` | Flow effacé, menu principal affiché |
| Changer de langue en cours | `english` / `français` | Flow effacé, menu dans nouvelle langue |
| Multi-besoins | `1,3` ou `1 2` | Ticket avec `أكل, دوا` (dédupliqué) |
| Rate limit | Envoyer 6+ msgs rapides | `⚠️ عم تبعت كتير رسائل...` |
| Texte libre au lieu de chiffre | `j'ai besoin de tout` | Ticket avec le texte brut comme besoin |

---

## Vérifications post-test

- [ ] Ticket reçu dans la réponse WhatsApp (format `AID-XXXXXX`)
- [ ] Bénévoles `on_duty=true` ont reçu la notification (vérifier leur WhatsApp)
- [ ] Log `aid_request_submitted` visible dans Vercel Logs
- [ ] ~~Ligne ajoutée dans l'onglet `aid_requests` du Google Sheet~~ **⚠️ Non implémenté**
