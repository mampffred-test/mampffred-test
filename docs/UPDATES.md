# App-Updates, Standardrezepte und Zurücksetzen

## Untersuchung vom 13. September 2026

Die veröffentlichte Version dd1a203 lud im direkten Produktionstest alle vier Standardrezepte. Der konkrete Versions- und Speicherzustand auf dem Samsung-Handy konnte nicht aus der Ferne ausgelesen werden. Ein falscher oder veralteter Installationslink bleibt deshalb neben einem veralteten geöffneten App-Fenster eine mögliche Ursache.

Im bisherigen Code waren folgende Lücken nachweisbar:

- Die Versionsanzeige war immer 0.1.0, unabhängig vom ausgelieferten Build.
- Der Service Worker aktivierte neue Caches automatisch, ohne die alte geöffnete App neu zu laden. Eine neue Worker-Version bedeutet jedoch nicht, dass ein bestehendes Fenster bereits neuen Anwendungscode ausführt.
- Netzwerk-Navigationen konnten neues HTML in den Cache einer älteren Version schreiben. Gleichzeitig wurden alte Caches unmittelbar entfernt, obwohl offene Fenster ihre alten JavaScript-Module noch nachladen konnten.
- Es gab weder eine sichtbare Update-Prüfung noch eine manuelle Reparatur der Standardrezepte oder einen vollständigen Datenreset in der App.
- Android-App-Installation und Website-Speicher sind unterschiedliche Dinge. Chrome-WebAPKs verwenden den Chrome-Speicher der Website. Deinstallation und das Leeren des Android-App-Caches sind deshalb kein verlässlicher Test eines leeren Website-Speichers.

## Verbindlicher Update-Ablauf

1. Die sichtbare Versionsnummer (z. B. 0.1.1) stammt aus package.json und wird bei Veröffentlichungen erhöht; package-lock.json wird dabei mitgeführt. Zusätzlich erhält jeder Build eine aus den ausgelieferten Quell- und Asset-Inhalten abgeleitete Kennung. App, Service Worker und version.json tragen dieselbe Kennung. Die technische Update-Erkennung vergleicht weiterhin diese Kennung, damit auch Änderungen innerhalb derselben Versionsnummer erkannt werden. Unter **Installationsadresse** bleibt sie für die Diagnose sichtbar.
2. Die App prüft beim Start, bei Rückkehr in den Vordergrund und regelmäßig während der Nutzung auf Updates. Zusätzlich gibt es unter **Mehr → App & Updates** den Button **Nach Updates suchen**.
3. Die neue Version lädt zunächst ihre vollständige Offline-Ausstattung. Cache- und HTTP-Wiederverwendung darf dabei keine alte Ausstattung als neue Installation ausgeben.
4. Ein vorbereitetes Update wird angezeigt. Die App lädt erst nach **Jetzt aktualisieren** neu; zuvor werden ihre ausstehenden Schreibaufträge abgewartet. Im Rezepteditor wird der globale Neustart-Button nicht angeboten.
5. Die Navigation eines kontrollierten App-Fensters erhält HTML und Module aus derselben vorbereiteten Version. Zwei vorherige Caches bleiben vorübergehend für noch offene alte Fenster verfügbar.
6. Nach dem Start ergänzt die neue App ihre noch nicht installierten Standardrezepte. Bilder und Installationsmarkierungen werden zusammen mit den Rezepten gespeichert.

Es gibt keinen Fernzugriff auf die private Rezeptsammlung. Neue Standardrezepte werden als Teil einer App-Version verteilt und beim nächsten Start dieser Version lokal ergänzt. Eine geschlossene Offline-App kann sie nicht sofort empfangen.

## Persönliche Daten und Standardrezepte

Automatische Aktualisierungen überschreiben keine persönlichen Fassungen. Bekannte importierte Fassungen werden erkannt. Einmal bewusst entfernte Standardrezepte erscheinen bei normalen Updates nicht erneut.

**Standardrezepte wiederherstellen** ist eine ausdrückliche Aktion: Sie ergänzt fehlende oder entfernte Standards und repariert fehlende gebündelte Bilder, ohne persönliche Rezepte zu ersetzen. Die Anzeige nennt den vorhandenen Umfang des Standardpakets.

## Alte Installationen erreichen

Die eigenständige Seite **update.html** lässt sich direkt in dem Chrome-Profil öffnen, mit dem die App installiert wurde. Sie benötigt keine funktionierende aktuelle App-Oberfläche. **App jetzt aktualisieren** installiert und aktiviert den aktuellen Service Worker. Dabei werden keine Rezepte, Bilder oder Planungen gelöscht.

Bei Problemen die angezeigte Build-Kennung und die Installationsadresse unter **App & Updates** vergleichen. Unterschiedliche Browserprofile und unterschiedliche Website-Adressen können getrennte Installationen sein.

## Vollständig zurücksetzen

Unter **Mehr → Datenschutz & Speicher → App vollständig zurücksetzen** wird der Umfang erklärt und eine Sicherung angeboten. Die irreversible Aktion erfordert die Eingabe **ZURÜCKSETZEN**.

Die vier Standardbilder werden vorab vorbereitet. Danach ersetzt eine einzige IndexedDB-Transaktion die persönlichen Metadaten und Bilder durch einen frischen Datenbestand. Vorherige Schreibaufträge werden geordnet abgearbeitet; alte Lösch-Timer werden beendet. Bei fehlenden Bildern oder einem Transaktionsfehler wird der bestehende Datenbestand nicht teilweise geleert.

Der neue Bestand enthält ausschließlich vier Standardrezepte. Eigene Rezepte, Entwürfe, eigene Lebensmittel, Planungen, Einkaufsliste, Einstellungen und der Sicherungszeitpunkt sind entfernt. Der temporäre Rezept-Eingang wird geleert. Heruntergeladene Sicherungsdateien außerhalb der App bleiben erhalten. Programm-Caches enthalten keine persönliche Rezeptsammlung und werden für diesen Datenreset nicht benötigt.

## Prüfung

- Echter mobiler Produktionsbuild: Erstinstallation, vier Standardrezepte und erfolgreiche Versionsabfrage.
- Laufender Build A → Build B: Update-Erkennung, explizite Aktivierung und neue sichtbare Build-Kennung.
- Reparatur-Link sowie Standardrezept-Reparatur ohne Duplikate.
- Reset-Bestätigung mit zunächst deaktivierter Löschaktion; kein Nutzerbestand wurde testweise gelöscht.
- Automatisierte Tests für Worker-Aktivierung, Versionsvergleich, Netzwerkfehler, Installationsfehler, erhaltene Rezeptänderungen, vollständigen Transaktionsreset, Rollback und Schreibreihenfolge.

Quellen zum Browserverhalten: [Chrome WebAPKs](https://web.dev/articles/webapks), [Service-Worker-Lebenszyklus](https://developer.chrome.com/docs/workbox/service-worker-lifecycle), [PWA-Updates](https://web.dev/learn/pwa/update).
