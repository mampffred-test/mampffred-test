# Mampffred

Mampffred ist eine private, offlinefähige PWA für Rezepte, Wochenplanung und Einkauf. Die Anwendung besitzt kein Backend: Rezepte, Planungen und eigene Bilder bleiben im IndexedDB-Speicher des jeweiligen Geräts.

## Aktueller Funktionsumfang

- Onboarding und installierbare PWA
- Tagesansicht mit Frühstück, Mittag- und Abendessen
- Wochenplan mit Rezeptauswahl und frei wählbaren Zubereitungsportionen
- durchsuchbare Rezeptbibliothek, Favoriten und Rezeptdetails
- Rezepteditor mit lokal optimierten WebP-Bildern, automatischer lokaler
  Nährwertberechnung und jederzeit vorrangiger eigener Proteinangabe
- Einkaufsliste mit Kategorien, Fortschritt und prüfbarer Übernahme aus dem
  Wochenplan
- freiwillige lokale Wochenübersicht „Protein im Plan“ mit eigenem
  Wochen-Planwert; fehlende Angaben werden niemals als null gerechnet
- vollständig eingebetteter Bundeslebensmittelschlüssel 4.0 mit 7.140
  Lebensmitteln; Zuordnung, Suche und Berechnung erzeugen keine Netzwerkanfrage
- wirklich leerer Erststart mit ausdrücklich wählbaren Beispielrezepten
- verschlüsselte Sicherung mit AES-256-GCM inklusive eigener Bilder
- Offline-App-Shell über einen Service Worker

## Lokal entwickeln

```bash
npm install
npm run dev
```

Vite zeigt die lokale Adresse beim Start an; standardmäßig ist das
`http://localhost:5173`.

## Prüfen und bauen

```bash
npm run check
npm test
npm run build
```

Die vollständig statische Ausgabe liegt in `dist/client`. Der mitgelieferte Workflow veröffentlicht diesen Ordner automatisch auf GitHub Pages, sobald auf `main` gepusht wird.

Die Konfiguration erkennt in GitHub Actions automatisch, ob sie als Nutzerseite
unter `https://DEIN-NAME.github.io/` oder als Projektseite unter
`https://DEIN-NAME.github.io/REPOSITORY/` gebaut wird. Lokal lässt sich der Pfad
bei Bedarf über `VITE_BASE_PATH` vorgeben.

## Datenschutzmodell

Der Webserver liefert nur den unveränderlichen App-Code und die mitgelieferten
Beispielbilder sowie die eingebetteten öffentlichen Lebensmitteldaten aus.
Nutzerdaten werden nicht an GitHub, OpenAI oder einen anderen Dienst übertragen.
Eine Content Security Policy blockiert aus dem App-Code heraus zusätzlich alle
Laufzeitverbindungen zu APIs (`connect-src 'none'`).

Wichtig: IndexedDB wird nach Browser-Origin isoliert, nicht nach dem Pfad eines
GitHub-Pages-Repositories. Alle Projektseiten unter derselben Adresse wie
`https://DEIN-NAME.github.io/...` teilen sich deshalb technisch denselben lokalen
Speicherbereich. Auf dieser Origin sollte nur eigener, vertrauenswürdiger Code
laufen. Für eine strikte kostenlose Trennung kann Mampffred über ein separates
GitHub-Konto veröffentlicht werden, dessen Pages-Origin ausschließlich diese App
enthält.

## Nährwertdaten und Grenzen

Mampffred verwendet den **Bundeslebensmittelschlüssel (BLS), Version 4.0**:
Max Rubner-Institut (2025), Deutsche Nährstoffdatenbank,
[DOI 10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0),
lizenziert unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Die offizielle Quelle und Lizenzinformation stehen auf der
[BLS-Downloadseite](https://blsdb.de/download).

Für die Laufzeit wird ein reproduzierbar erzeugter Ausschnitt mit Energie,
Protein, Fett, Kohlenhydraten, Ballaststoffen, Zucker und Salz verwendet. Werte
beziehen sich auf 100 g essbaren Anteil. Nicht numerische Angaben wie „unter der
Nachweisgrenze“ bleiben fehlend und werden nicht als Null interpretiert.

Automatische Zuordnung ist optional. Sie bestätigt nur eindeutige Namen oder
lokal gespeicherte Nutzerzuordnungen. Gramm und Kilogramm werden direkt
umgerechnet; Volumen und Stückeinheiten benötigen einen lebensmittelspezifischen
Faktor. Unvollständige Rezepte fließen nicht in Wochenvergleiche oder Vorschläge
ein. Die Funktion ist eine Planungshilfe, keine medizinische Ernährungsberatung.

Nährwerte aus einer wiederhergestellten Sicherung gelten zunächst als
ungeprüft; importierte Zutatenkorrekturen und direkte Lebensmittelzuordnungen
werden nicht übernommen. Eigene Lebensmittel aus einer Sicherung bleiben bis
zur Einzelprüfung und Speicherung von Berechnungen ausgeschlossen. Damit kann
eine externe Datei keine angeblich lokal bestätigte oder BLS-berechnete Herkunft
vortäuschen. Die Schätzung kann danach mit dem eingebetteten Datensatz erneut
lokal aktiviert werden.

Der für den geprüften Quelldownload verwendete SHA-256 lautet
`12b7a6ba62807ec9b301eb276f897dc85f99b2292311618dec3749a12d984c91`.
`scripts/extract-bls.py` erzeugt daraus deterministisch
`lib/data/bls-4.0.min.json`; ein normaler App-Build lädt keine Daten aus dem
Internet nach.
