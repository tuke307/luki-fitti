# Privacy policy additions for social features (draft)

> **Draft — needs legal review before 2.0.0.** Goes into
> `apps/web/app/(site)/site/[locale]/datenschutz/page.tsx` and the App Store privacy labels in
> PR 5. Open legal points are at the end.

## Deutsch

### Soziale Funktionen (Freunde, Ligen, Duelle, Raids)

Wenn du die sozialen Funktionen nutzt, verarbeiten wir zusätzlich:

- **Profil:** deinen Benutzernamen (@handle), optional ein Profilbild und deinen Anzeigenamen.
  Andere Nutzer sehen deinen @handle und dein Profilbild, z. B. in der Suche und in Ligen.
  Deinen Anzeigenamen und deine Trainingsdetails sehen nur deine bestätigten Freunde.
- **Freundschaften, Anfragen, Blockierungen und Meldungen.** Wenn du jemanden meldest, speichern
  wir zur Prüfung eine Kopie von dessen @handle, Namen und Profilbild zum Zeitpunkt der Meldung.
- **Punkte und Platzierungen:** aus deinen Trainings berechnete Wochenpunkte, deine Liga und
  deine Platzierung. In Ligen sehen andere Teilnehmer deinen @handle, dein Profilbild und deine
  Wochenpunkte, keine Trainingsinhalte.
- **Push-Benachrichtigungen:** ein Geräte-Token (Apple Push Notification Service bzw. Web Push
  deines Browsers), Sprache und Zeitzone, damit wir dich zur richtigen Zeit benachrichtigen.
  Die Inhalte werden über Apple bzw. den Push-Dienst deines Browsers zugestellt.

Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO). Du kannst
die sozialen Funktionen jederzeit pausieren; dann erscheinst du nicht mehr in Ligen und erhältst
keine sozialen Push-Nachrichten.

### Freunde über Kontakte finden

Wenn du „Freunde über Kontakte finden“ nutzt, liest die App die E-Mail-Adressen aus deinen
Kontakten **auf deinem Gerät** und wandelt jede Adresse dort in einen nicht umkehrbaren
Prüfwert (SHA-256-Hash) um. Nur diese Prüfwerte werden an unseren Server gesendet. Der Server
vergleicht sie mit den Prüfwerten der Nutzer, die „Über E-Mail auffindbar“ eingeschaltet haben,
und schickt dir die Treffer zurück. **Prüfwerte ohne Treffer werden sofort verworfen und weder
gespeichert noch protokolliert.** Namen, Telefonnummern oder andere Kontaktdaten werden nicht
übertragen.

Rechtsgrundlage ist unser berechtigtes Interesse und das deiner Kontakte, sich in der App zu
finden (Art. 6 Abs. 1 lit. f DSGVO). Du kannst in deinem Profil ausschalten, dass andere dich
über deine E-Mail-Adresse finden.

### Speicherdauer

Soziale Daten bleiben gespeichert, solange dein Konto besteht. Beim Löschen des Kontos werden
Profilbild, Freundschaften, Punkte, Ligaplatzierungen, Geräte-Tokens und Benachrichtigungen
gelöscht. Meldungen gegen dich werden mit deinem Konto gelöscht.

## English

### Social features (friends, leagues, duels, raids)

When you use the social features we additionally process:

- **Profile:** your username (@handle), optionally a profile photo and your display name.
  Other users see your @handle and photo, e.g. in search and leagues. Only your accepted friends
  see your display name and workout details.
- **Friendships, requests, blocks and reports.** When you report someone, we keep a copy of
  their @handle, name and photo at the time of the report so it can be reviewed.
- **Points and rankings:** weekly points calculated from your workouts, your league and your
  rank. In leagues, other participants see your @handle, photo and weekly points, not your
  workout contents.
- **Push notifications:** a device token (Apple Push Notification service or your browser's
  Web Push service), language and time zone, so we can notify you at the right time. Messages
  are delivered via Apple or your browser's push service.

The legal basis is the performance of the user agreement (Art. 6(1)(b) GDPR). You can pause
the social features at any time; you then no longer appear in leagues and receive no social
push notifications.

### Finding friends via contacts

When you use "Find friends from contacts", the app reads the email addresses in your contacts
**on your device** and turns each address into a one-way check value (SHA-256 hash) there.
Only these check values are sent to our server. The server compares them with the check values
of users who turned on "Find me by email" and returns the matches. **Check values without a
match are discarded immediately and are neither stored nor logged.** Names, phone numbers and
other contact details are never transmitted.

The legal basis is our legitimate interest and that of your contacts in finding each other in
the app (Art. 6(1)(f) GDPR). You can turn off "Find me by email" in your profile.

### Retention

Social data is kept as long as your account exists. Deleting your account removes your photo,
friendships, points, league placements, device tokens and notifications. Reports about you are
deleted with your account.

## Open points for the legal review

1. **Hash wording.** An unsalted SHA-256 of an email address can be matched against known
   addresses, so it is pseudonymisation, not anonymisation. Is "nicht umkehrbarer Prüfwert"
   acceptable, or should the text say "pseudonymisiert"?
2. **Legal basis for contact matching** (Art. 6(1)(f) for the non-user contacts) and whether
   it needs a balancing test on record, or a DPIA.
3. **Report retention.** Reports are currently deleted together with either account. Is a
   retention period needed for abuse cases?
4. **Default "Find me by email" = on** during onboarding (with an explanation and a switch).
   Is opt-out acceptable, or must it be opt-in?
5. **App Store privacy labels:** Contacts ("App Functionality", not linked to identity,
   not used for tracking), User Content (photos), Identifiers (device token), Usage Data.
