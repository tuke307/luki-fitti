import type { CatalogTranslation } from '../types';

/**
 * German translation of the built-in catalog. Exercises are keyed by exercise id, starter content by
 * the id of its starter definition (also stored as `systemKey` on user copies), notes by the id of
 * the starter template/routine exercise they belong to.
 */
export const de: CatalogTranslation = {
  exercises: {
    // ── CHEST ────────────────────────────────────────────────────────────────
    'ex-barbell-bench-press': {
      name: 'Bankdrücken (Langhantel)',
      description:
        'Grundlegende horizontale Druckübung für den unteren Brustmuskel, die vorderen Schultern und den Trizeps.',
      instructions: [
        'Lege dich flach auf die Bank, die Augen direkt unter der Stange, die Füße fest am Boden.',
        'Ziehe die Schulterblätter zusammen und nach unten und greife die Stange etwas breiter als schulterbreit.',
        'Hebe die Stange aus der Ablage und senke sie kontrolliert zur unteren Brust ab, die Ellbogen bei etwa 45–60 Grad.',
        'Drücke die Stange bis zur Streckung nach oben, ohne die Spannung im oberen Rücken zu verlieren.',
      ],
    },
    'ex-dumbbell-incline-press': {
      name: 'Schrägbankdrücken (Kurzhanteln)',
      description:
        'Druckübung für die obere Brust auf einer 30-Grad-Schrägbank – mehr Aktivierung des oberen Brustmuskels bei schulterschonendem Bewegungsumfang.',
      instructions: [
        'Stelle die Bank auf 30 Grad ein und bringe die Kurzhanteln mit Schwung der Knie auf Schulterhöhe.',
        'Halte die Handgelenke über den Ellbogen und senke die Hanteln, bis du eine tiefe Dehnung in der oberen Brust spürst.',
        'Drücke die Hanteln gleichmäßig nach oben, ohne sie oben gegeneinanderzuschlagen.',
      ],
    },
    'ex-machine-chest-press': {
      name: 'Brustpresse (Maschine, sitzend)',
      description:
        'Geführte horizontale Brustpresse mit hoher Stabilität, um sicher bis nahe ans Muskelversagen zu trainieren.',
      instructions: [
        'Stelle die Sitzhöhe so ein, dass die Griffe auf Höhe der mittleren bis unteren Brust sind.',
        'Drücke die Schulterblätter nach hinten ins Polster und schiebe die Griffe bis zur vollen Streckung nach vorne.',
        'Führe die exzentrische Phase 2–3 Sekunden kontrolliert aus, ohne dass der Gewichtsstapel aufsetzt.',
      ],
    },
    'ex-cable-chest-fly': {
      name: 'Cable Fly (Kabelzug)',
      description:
        'Horizontale Adduktion unter konstanter Spannung, die den großen Brustmuskel über den gesamten Bewegungsumfang isoliert.',
      instructions: [
        'Stelle beide Seilzüge auf Brusthöhe ein, greife die Griffe und mache einen Schritt nach vorne in eine Schrittstellung.',
        'Öffne die Arme mit leicht gebeugten Ellbogen, bis du eine sanfte Dehnung in der Brust spürst.',
        'Führe die Hände in einem weiten Bogen zusammen und spanne die Brust am Endpunkt 1 Sekunde lang an.',
      ],
    },
    'ex-push-up': {
      name: 'Liegestütz',
      description: 'Körpergewichtsübung für die Brust, unterstützt von Rumpf und Schultern.',
      instructions: [
        'Lege dich mit dem Gesicht nach unten auf eine Trainingsmatte.',
        'Stelle die Zehen auf und setze die Hände schulterbreit flach auf den Boden, die Finger zeigen nach vorne.',
        'Beuge die Ellbogen und senke die Brust Richtung Boden ab.',
        'Spanne unten die Brust an, drücke dich vom Boden weg und kehre in die Ausgangsposition zurück.',
      ],
    },
    'ex-dumbbell-bench-press': {
      name: 'Bankdrücken (Kurzhanteln)',
      description: 'Kurzhantelübung für die Brust, unterstützt von Rumpf und Schultern.',
      instructions: [
        'Lege dich auf eine Flachbank, in jeder Hand eine Kurzhantel, die auf deinen Oberschenkeln ruht.',
        'Drücke die Kurzhanteln senkrecht nach oben bis zur vollen Armstreckung, sodass sie sich am höchsten Punkt berühren.',
        'Kehre in die Ausgangsposition zurück.',
      ],
    },
    'ex-dumbbell-fly': {
      name: 'Fliegende (Kurzhanteln)',
      description: 'Kurzhantelübung für die Brust, unterstützt von Schultern und Trizeps.',
      instructions: [
        'Lege dich auf eine Flachbank, in jeder Hand eine Kurzhantel, die auf deinen Oberschenkeln ruht.',
        'Die Handflächen zeigen zueinander.',
        'Hebe die Kurzhanteln nacheinander an.',
        'Halte die Kurzhanteln schulterbreit vor dir.',
        'Die Handflächen sollten zueinander zeigen.',
        'Drücke die Hanteln wie beim Bankdrücken nach oben und halte kurz vor der vollständigen Streckung an.',
        'Beuge die Ellbogen leicht und senke die Arme in einem weiten Bogen zu beiden Seiten ab.',
        'Senke die Arme weiter, bis du eine Dehnung in der Brust spürst.',
      ],
    },
    'ex-incline-dumbbell-fly': {
      name: 'Schrägbank-Fliegende (Kurzhanteln)',
      description: 'Kurzhantelübung für die Brust, unterstützt von den Schultern.',
      instructions: [
        'Nimm in jede Hand eine Kurzhantel und lege dich auf eine Schrägbank mit höchstens 30 Grad Neigung.',
        'Strecke die Arme mit leicht gebeugten Ellbogen über dir aus.',
        'Drehe die Handgelenke so, dass die Handflächen zu dir zeigen.',
        'Das ist die Ausgangsposition.',
        'Senke die Arme langsam seitlich ab, halte sie gestreckt und drehe die Handgelenke, bis die Handflächen zueinander zeigen.',
        'Atme aus und führe die Kurzhanteln in umgekehrter Bewegung zurück in die Ausgangsposition.',
        'Drehe die Hände, bis die kleinen Finger wieder nebeneinander liegen.',
      ],
    },
    'ex-incline-barbell-bench-press': {
      name: 'Schrägbankdrücken (Langhantel)',
      description: 'Langhantelübung für die Brust, unterstützt von Rumpf und Schultern.',
      instructions: [
        'Lege dich auf eine Schrägbank.',
        'Greife die Stange mittelbreit und hebe sie aus der Ablage.',
        'Halte sie mit gestreckten Armen gerade über dir.',
        'Das ist die Ausgangsposition für die Übung.',
        'Halte das Gewicht nach dem Ausheben mit gestreckten Armen über der Brust.',
        'Senke die Stange zur oberen Brust ab.',
        'Halte kurz inne und drücke die Stange zurück in die Ausgangsposition.',
        'Die Arme sollten oben gestreckt sein.',
      ],
    },
    'ex-pec-deck-fly': {
      name: 'Butterfly (Maschine)',
      description: 'Maschinenübung für die Brust.',
      instructions: [
        'Setze dich an die Maschine, der Rücken liegt flach am Polster.',
        'Greife die Griffe. Tipp: Die Oberarme sollten parallel zum Boden sein – stelle die Maschine entsprechend ein. Das ist die Ausgangsposition.',
        'Führe die Griffe langsam zusammen und spanne die Brust in der Mitte an. Atme dabei aus und halte die Kontraktion eine Sekunde.',
        'Kehre beim Einatmen langsam in die Ausgangsposition zurück, bis die Brustmuskeln vollständig gedehnt sind.',
        'Wiederhole die Übung für die empfohlene Anzahl an Wiederholungen.',
      ],
    },
    'ex-machine-incline-chest-press': {
      name: 'Schrägbank-Brustpresse (Maschine)',
      description: 'Maschinenübung für die Brust, unterstützt vom Trizeps.',
      instructions: [
        'Greife die Griffe fest.',
        'Ziehe die Schulterblätter zusammen und hebe die Ellbogen auf Griffhöhe.',
        'Drücke die Arme schräg nach vorne oben, bis sie vollständig gestreckt sind.',
        'Führe die Griffe zueinander, bis sich die Arme treffen, und senke sie dann etwas langsamer zur Brust zurück.',
        'Wiederhole die Übung.',
      ],
    },

    // ── BACK ─────────────────────────────────────────────────────────────────
    'ex-weighted-pull-up': {
      name: 'Klimmzug (Körpergewicht / mit Zusatzgewicht)',
      description:
        'Klassische vertikale Zugübung für einen breiten Latissimus, den großen Rundmuskel und einen dicken oberen Rücken.',
      instructions: [
        'Greife die Stange im Obergriff etwas breiter als schulterbreit.',
        'Starte den Zug, indem du die Schulterblätter nach unten ziehst und die Ellbogen Richtung Hüfte führst.',
        'Ziehe dich hoch, bis das Kinn über der Stange ist, und lass dich dann kontrolliert bis in den vollen Hang ab.',
      ],
    },
    'ex-lat-pulldown': {
      name: 'Latzug (breiter Griff)',
      description:
        'Vertikaler Zug am Kabel mit präziser Laststeigerung für Latissimus und oberen Rücken.',
      instructions: [
        'Fixiere die Oberschenkel unter dem Knie-Polster und greife die Stange breit im Obergriff.',
        'Lehne dich leicht zurück (ca. 10–15 Grad) und ziehe die Stange zur oberen Brust.',
        'Strecke die Arme langsam nach oben, bis der Latissimus vollständig gedehnt ist.',
      ],
    },
    'ex-barbell-bent-over-row': {
      name: 'Vorgebeugtes Rudern (Langhantel)',
      description:
        'Schwere horizontale Ruderübung für einen dicken mittleren Rücken, Rhomboiden, Latissimus und Rückenstrecker.',
      instructions: [
        'Beuge dich aus der Hüfte vor, bis der Oberkörper etwa 30–45 Grad über der Waagerechten ist, der Rumpf ist angespannt.',
        'Ziehe die Langhantel zu den unteren Rippen bzw. zum oberen Bauch und führe die Ellbogen hinter den Oberkörper.',
        'Senke die Stange kontrolliert ab, ohne den Oberkörper stark mitzuschwingen.',
      ],
    },
    'ex-seated-cable-row': {
      name: 'Rudern am Kabelzug (sitzend)',
      description:
        'Kontrolliertes horizontales Rudern am Kabel für mittleren Trapez, Rhomboiden und Latissimus bei geringer Belastung des unteren Rückens.',
      instructions: [
        'Setze dich aufrecht hin, die Füße auf der Plattform, die Knie leicht gebeugt.',
        'Lass die Schulterblätter in der Dehnung leicht nach vorne gleiten und ziehe den Griff dann zur Körpermitte.',
        'Ziehe die Schulterblätter 1 Sekunde zusammen, bevor du zurückgehst.',
      ],
    },
    'ex-chin-up': {
      name: 'Klimmzug (Untergriff, Chin-Up)',
      description: 'Körpergewichtsübung für den Rücken, unterstützt von Bizeps und Unterarmen.',
      instructions: [
        'Greife die Klimmzugstange mit den Handflächen zu dir, die Hände etwas enger als schulterbreit.',
        'Ziehe den Oberkörper nach oben, bis die Stange die obere Brust berührt, indem du Schultern und Oberarme nach unten und hinten ziehst.',
        'Atme während dieser Bewegung aus.',
        'Spanne die Rückenmuskeln an, atme dann ein, während du die Arme vollständig streckst und in die Ausgangsposition zurückkehrst.',
      ],
    },
    'ex-chest-supported-dumbbell-row': {
      name: 'Rudern auf der Schrägbank (Kurzhanteln)',
      description: 'Kurzhantelübung für den Rücken, unterstützt von Bizeps und Unterarmen.',
      instructions: [
        'Lege dich mit neutralem Griff bäuchlings auf eine Schrägbank.',
        'Nimm in jede Hand eine Kurzhantel und drehe die Hände so, dass die Handflächen zueinander zeigen.',
        'Ziehe die Schulterblätter zurück und beuge die Ellbogen, um die Hanteln seitlich zum Körper zu rudern.',
        'Halte kurz und senke die Kurzhanteln dann wieder ab.',
      ],
    },
    'ex-one-arm-dumbbell-row': {
      name: 'Einarmiges Kurzhantelrudern',
      description: 'Kurzhantelübung für den Rücken, unterstützt von Rumpf und Bizeps.',
      instructions: [
        'Nimm eine Flachbank und lege auf jede Seite eine Kurzhantel.',
        'Stütze rechte Hand und rechtes Knie auf der Bank ab.',
        'Greife mit geradem Rücken und parallel zur Bank ausgerichtetem Oberkörper die linke Kurzhantel mit der linken Hand, Handfläche zu dir.',
        'Ziehe die Kurzhantel gerade nach oben seitlich an die Brust, der Oberarm bleibt nah am Körper, der Oberkörper bleibt ruhig.',
        'Senke die Kurzhantel, bis der Arm gerade nach unten hängt und der Ellbogen nur leicht gebeugt ist.',
      ],
    },
    'ex-straight-arm-pulldown': {
      name: 'Überzüge am Kabel (gestreckte Arme)',
      description: 'Kabelübung für den Rücken.',
      instructions: [
        'Greife die breite Stange am oberen Seilzug im Obergriff, breiter als schulterbreit.',
        'Neige den Oberkörper leicht nach vorne und strecke die Arme mit leicht gebeugten Ellbogen vor dir aus.',
        'Ziehe die Stange durch Anspannen des Latissimus nach unten, bis die Hände neben den Oberschenkeln sind.',
        'Kehre die Bewegung um und gehe zurück in die Ausgangsposition.',
      ],
    },
    'ex-dumbbell-bent-over-row': {
      name: 'Vorgebeugtes Rudern (Kurzhanteln)',
      description: 'Kurzhantelübung für den Rücken, unterstützt von Rumpf und Bizeps.',
      instructions: [
        'Nimm in jede Hand eine Kurzhantel, beuge die Knie leicht und neige den Oberkörper aus der Hüfte vor. Halte den Rücken gerade, bis er fast parallel zum Boden ist.',
        'Ziehe die Kurzhanteln bei ruhigem Oberkörper beim Ausatmen seitlich nach oben, die Ellbogen bleiben nah am Körper.',
        'Spanne oben die Rückenmuskeln an und halte eine Sekunde.',
        'Senke das Gewicht beim Einatmen langsam wieder in die Ausgangsposition.',
      ],
    },
    'ex-back-extension': {
      name: 'Rückenstrecker (Hyperextension)',
      description: 'Geräteübung für den Rücken, unterstützt von Gesäß und hinterem Oberschenkel.',
      instructions: [
        'Positioniere dich im Hyperextension-Gerät, die Beine unter den Fußpolstern.',
        'Verschränke die Arme bei geradem Körper vor der Brust.',
        'Senke den Oberkörper aus der Hüfte so weit Richtung Boden, wie es angenehm möglich ist.',
        'Halte den Rücken in seiner natürlichen Krümmung – nicht zu weit vorbeugen und keinen Rundrücken machen.',
        'Richte den Oberkörper beim Einatmen langsam wieder in die Ausgangsposition auf.',
      ],
    },
    'ex-close-grip-lat-pulldown': {
      name: 'Latzug (enger Griff)',
      description: 'Kabelübung für den Rücken, unterstützt vom Bizeps.',
      instructions: [
        'Wähle Ober- oder Untergriff.',
        'Schiebe die Brust nach vorne, während du die Stange zum Kinn ziehst.',
        'Halte am Ende der Bewegung die Arme eng am Körper und betone die Endposition.',
        'Kehre langsam in die Ausgangsposition zurück und wiederhole.',
      ],
    },
    'ex-single-arm-cable-row': {
      name: 'Einarmiges Rudern am Kabelzug (sitzend)',
      description: 'Kabelübung für den Rücken, unterstützt vom Bizeps.',
      instructions: [
        'Setze dich mit leicht gebeugten Knien hin.',
        'In der Ausgangsposition sind der arbeitende Arm und die Schulter weit nach vorne gestreckt, der Körper ist leicht zur selben Seite gedreht.',
        'Ziehe Schulter und Arm ganz nach hinten und lass den Körper die Drehbewegung mitmachen.',
      ],
    },
    'ex-machine-high-row': {
      name: 'Rudern an der Maschine mit Brustauflage (breit)',
      description: 'Maschinenübung für den Rücken, unterstützt von den Schultern.',
      instructions: [
        'Setze dich aufrecht mit leichtem Hohlkreuz hin und halte guten Kontakt zum Brustpolster.',
        'Greife die Griffe breit, die Arme gestreckt, die Schultern nach vorne geschoben.',
        'Ziehe die Griffe zur Brust.',
        'Verliere dabei nicht den Kontakt zum Brustpolster.',
      ],
    },

    // ── SHOULDERS ────────────────────────────────────────────────────────────
    'ex-overhead-barbell-press': {
      name: 'Schulterdrücken stehend (Langhantel, OHP)',
      description:
        'Strikte vertikale Druckübung für Kraft in der vorderen und seitlichen Schulter sowie Stabilität in Rumpf und Trizeps.',
      instructions: [
        'Stelle dich schulterbreit hin, Gesäß und Bauch angespannt, die Stange liegt auf den vorderen Schultern.',
        'Drücke die Stange senkrecht am Kinn vorbei nach oben und schiebe den Kopf leicht nach vorne, sobald die Stange vorbei ist.',
        'Senke die Stange kontrolliert zurück zu den Schlüsselbeinen.',
      ],
    },
    'ex-seated-dumbbell-shoulder-press': {
      name: 'Schulterdrücken sitzend (Kurzhanteln)',
      description:
        'Schulterdrücken mit natürlicher Bewegung in der Schulterblattebene für Muskelaufbau der Schultern – auch einarmig gut machbar.',
      instructions: [
        'Setze dich auf eine aufrechte Bank mit Rückenlehne und halte die Kurzhanteln auf Ohrhöhe in der Schulterblattebene (ca. 30 Grad nach vorne).',
        'Drücke die Hanteln bis kurz vor die volle Streckung nach oben und senke sie dann gleichmäßig auf 90 Grad oder etwas tiefer ab.',
      ],
    },
    'ex-dumbbell-lateral-raise': {
      name: 'Seitheben (Kurzhanteln)',
      description:
        'Wichtige Isolationsübung für die seitliche Schulter – für breitere Schultern und ein V-Kreuz.',
      instructions: [
        'Stelle dich aufrecht mit leichter Hüftbeugung hin, die Kurzhanteln seitlich am Körper.',
        'Hebe die Arme in der Schulterblattebene (leicht vor dem Oberkörper) an, bis die Ellbogen auf Schulterhöhe sind.',
        'Senke die Hanteln kontrolliert ab, ohne mit dem Oberkörper zu schwingen.',
      ],
    },
    'ex-cable-face-pull': {
      name: 'Face Pulls (Seil am Kabelzug)',
      description:
        'Übung für hintere Schulter und Außenrotatoren – wichtig für gesunde Schultern und eine gute Haltung.',
      instructions: [
        'Befestige ein Seil am Kabelzug auf Höhe der oberen Brust bis Augenhöhe.',
        'Ziehe das Seil zur Stirn und rotiere die Schultern dabei nach außen, sodass die Daumen nach hinten zeigen.',
        'Halte am Endpunkt kurz inne, bevor du die Arme wieder streckst.',
      ],
    },
    'ex-machine-shoulder-press': {
      name: 'Schulterpresse (Maschine)',
      description: 'Maschinenübung für die Schultern, unterstützt von Bizeps und Unterarmen.',
      instructions: [
        'Halte den Rumpf angespannt und den Rücken gerade, während du in der Schulterpresse sitzt.',
        'Blicke geradeaus und halte die Griffe fest.',
        'Drücke die Griffe langsam über den Kopf nach oben.',
        'Strecke die Ellbogen dabei nicht vollständig durch.',
        'Führe die Griffe langsam wieder nach unten, ohne dass der Gewichtsstapel aufsetzt.',
        'Wiederhole die Bewegung.',
      ],
    },
    'ex-arnold-press': {
      name: 'Arnold Press',
      description: 'Kurzhantelübung für die Schultern, unterstützt von Bizeps und Trizeps.',
      instructions: [
        'Stelle eine verstellbare Bank auf 90 Grad ein und nimm zwei Kurzhanteln aus dem Ständer.',
        'Hebe die Kurzhanteln im Neutralgriff (Handflächen zueinander) vom Boden auf.',
        'Setze die Enden der Kurzhanteln auf deinen Knien ab und setze dich auf die Bank.',
        'Bringe die Kurzhanteln sicher und kontrolliert mit Schwung der Knie nacheinander in Position.',
        'Sobald die Kurzhanteln in Position sind, drehe die Handflächen zu dir.',
        'Atme tief ein und drücke die Kurzhanteln über den Kopf, indem du die Ellbogen streckst und die Schultern anspannst.',
        'Drehe die Kurzhanteln beim Drücken, bis die Handflächen nach vorne zeigen.',
        'Senke die Kurzhanteln langsam in die Ausgangsposition ab (die Arme sollten je nach Armlänge etwa 90 Grad oder etwas tiefer sein).',
      ],
    },
    'ex-standing-dumbbell-shoulder-press': {
      name: 'Schulterdrücken stehend (Kurzhanteln)',
      description: 'Kurzhantelübung für die Schultern, unterstützt vom Trizeps.',
      instructions: [
        'Stelle dich aufrecht hin und halte den Rücken gerade.',
        'Halte in jeder Hand eine Kurzhantel im Obergriff auf Schulterhöhe.',
        'Die Daumen zeigen nach innen, die Fingerknöchel nach oben.',
        'Drücke die Gewichte beim Ausatmen kontrolliert über den Kopf.',
        'Halte am höchsten Punkt kurz inne.',
        'Senke die Kurzhanteln beim Einatmen zurück auf Schulterhöhe.',
      ],
    },
    'ex-machine-lateral-raise': {
      name: 'Seitheben (Maschine)',
      description:
        'Geführte Isolationsübung für die seitliche Schulter – konstante Spannung, kein Schwung.',
      instructions: [
        'Setze dich aufrecht an die Maschine und stelle den Sitz so ein, dass deine Schultern auf Höhe der Drehpunkte sind und die Polster außen an den Oberarmen anliegen. Das ist die Ausgangsposition.',
        'Hebe die Arme bei ruhigem Oberkörper (kein Schwung) mit leicht gebeugten Ellbogen seitlich an, bis die Oberarme parallel zum Boden sind. Atme dabei aus und halte oben eine Sekunde.',
        'Senke die Polster beim Einatmen langsam in die Ausgangsposition ab, ohne dass der Gewichtsstapel aufsetzt.',
        'Wiederhole die Übung für die empfohlene Anzahl an Wiederholungen.',
      ],
    },
    'ex-cable-lateral-raise': {
      name: 'Einarmiges Seitheben am Kabelzug',
      description: 'Kabelübung für die Schultern.',
      instructions: [
        'Stelle dich seitlich zum Gerät, der Arm vor dem Körper, und greife den Griff fest.',
        'Hebe den Arm seitlich nach oben.',
        'Halte den Ellbogen während der gesamten Bewegung leicht gebeugt.',
        'Wechsle den Arm.',
      ],
    },
    'ex-barbell-front-raise': {
      name: 'Frontheben (Langhantel)',
      description: 'Langhantelübung für die Schultern.',
      instructions: [
        'Nimm eine Langhantel und stelle dich aufrecht hin.',
        'Greife die Stange schulterbreit im Obergriff.',
        'Halte den Oberkörper ruhig und hebe die Stange nach vorne, bis die Arme etwas über der Waagerechten sind.',
        'Kehre dann langsam in die Ausgangsposition zurück.',
        'Wiederhole nach Bedarf.',
      ],
    },
    'ex-dumbbell-front-raise': {
      name: 'Frontheben (Kurzhanteln)',
      description: 'Kurzhantelübung für die Schultern.',
      instructions: [
        'Nimm zwei Kurzhanteln und stelle dich aufrecht hin.',
        'Die Kurzhanteln befinden sich vor den Oberschenkeln, die Handflächen zeigen nach unten.',
        'Hebe bei ruhigem Oberkörper (kein Schwung) die linke Kurzhantel mit leicht gebeugtem Ellbogen nach vorne, die Handfläche zeigt immer nach unten.',
        'Hebe weiter, bis der Arm etwas über der Waagerechten ist.',
        'Senke die linke Kurzhantel langsam ab, bis du die Ausgangsposition erreichst.',
        'Hebe gleichzeitig die rechte Kurzhantel an.',
      ],
    },
    'ex-cable-upright-row': {
      name: 'Aufrechtes Rudern am Kabelzug',
      description: 'Kabelübung für die Schultern, unterstützt vom Rücken.',
      instructions: [
        'Stelle den Griff des Kabelzugs auf die unterste Position.',
        'Greife die Stange mit beiden Händen, die Handflächen zeigen nach unten.',
        'Beuge die Ellbogen und ziehe die Stange bis zur oberen Brust.',
        'Senke die Stange zurück auf Hüfthöhe.',
      ],
    },
    'ex-dumbbell-reverse-fly': {
      name: 'Reverse Flys (Kurzhanteln)',
      description: 'Kurzhantelübung für die Schultern.',
      instructions: [
        'Lege dich bäuchlings auf eine Schrägbank, Brust und Bauch liegen am Polster an.',
        'Halte in jeder Hand eine Kurzhantel, die Handflächen zeigen zueinander.',
        'Strecke die Arme gerade und leicht nach unten aus, Handflächen zueinander, Ellbogen leicht gebeugt.',
        'Stelle die Füße etwas breiter als schulterbreit und setze die Zehen fest auf – das ist die Ausgangsposition.',
        'Hebe die Kurzhanteln seitlich an und ziehe die Schulterblätter zusammen, bis die Arme parallel zum Boden und die Hanteln auf Schulterhöhe sind.',
        'Spüre die Kontraktion und senke die Kurzhanteln langsam in die Ausgangsposition ab.',
      ],
    },
    'ex-reverse-pec-deck': {
      name: 'Reverse Butterfly (Maschine)',
      description: 'Maschinenübung für die Schultern.',
      instructions: [
        'Setze dich mit der Brust zum Polster, die Arme zwischen den Polstern.',
        'Drücke die Arme seitlich nach hinten, sodass die Schulterblätter zusammengezogen werden.',
      ],
    },
    'ex-cable-reverse-fly': {
      name: 'Reverse Flys am Kabelzug',
      description: 'Kabelübung für die Schultern, unterstützt vom Rücken.',
      instructions: [
        'Stelle dich hin, die Arme vor der Hüfte gekreuzt, und greife die Griffe fest.',
        'Hebe die Arme seitlich nach oben, die Ellbogen bleiben während der gesamten Bewegung leicht gebeugt.',
        'Senke die Arme langsam wieder ab und wiederhole.',
      ],
    },
    'ex-barbell-shrug': {
      name: 'Shrugs (Langhantel)',
      description: 'Langhantelübung für die Schultern, unterstützt vom Rücken.',
      instructions: [
        'Stelle dich schulterbreit hinter eine Langhantel und nimm sie mit gestreckten Armen auf.',
        'Ziehe die Schultern beim Ausatmen so weit wie möglich nach oben und halte die Kontraktion eine Sekunde.',
        'Halte kurz inne und lass die Schultern dann beim Einatmen entspannt wieder sinken.',
      ],
    },
    'ex-dumbbell-shrug': {
      name: 'Shrugs (Kurzhanteln)',
      description: 'Kurzhantelübung für die Schultern, unterstützt vom Rücken.',
      instructions: [
        'Stelle dich aufrecht hin, in jeder Hand eine Kurzhantel.',
        'Die Handflächen zeigen zum Körper, die Arme hängen gestreckt seitlich herab.',
        'Hebe die Kurzhanteln beim Ausatmen an, indem du die Schultern so hoch wie möglich ziehst.',
        'Bringe die Kurzhanteln zurück in die Ausgangsposition.',
      ],
    },
    'ex-cable-shrug': {
      name: 'Shrugs am Kabelzug',
      description: 'Kabelübung für die Schultern, unterstützt vom Rücken.',
      instructions: [
        'Greife eine Stange, die am unteren Seilzug befestigt ist.',
        'Die Hände sind schulterbreit oder auf Wunsch etwas breiter.',
        'Stelle dich nah an den Seilzug und halte die Stange mit gestreckten Armen vor dir.',
        'Hebe die Stange an, indem du die Schultern so hoch wie möglich ziehst.',
        'Senke die Stange zurück in die Ausgangsposition.',
      ],
    },

    // ── ARMS ─────────────────────────────────────────────────────────────────
    'ex-ez-bar-bicep-curl': {
      name: 'Bizepscurls (SZ-Stange)',
      description:
        'Handgelenkschonende Curls mit der gewinkelten SZ-Stange, die den kurzen und langen Bizepskopf belasten.',
      instructions: [
        'Halte die SZ-Stange an den abgewinkelten Griffen, die Ellbogen liegen bequem seitlich am Körper.',
        'Curle die Stange in einem Bogen nach oben, ohne mit dem unteren Rücken Schwung zu holen.',
        'Spanne den Bizeps oben an und senke die Stange über 2–3 Sekunden bis zur vollen Ellbogenstreckung.',
      ],
    },
    'ex-incline-dumbbell-curl': {
      name: 'Schrägbank-Curls (Kurzhanteln)',
      description:
        'Bringt die Schulter in Streckung, um den langen Bizepskopf maximal zu dehnen und zu aktivieren.',
      instructions: [
        'Lehne dich auf einer 45–60-Grad-Schrägbank zurück und lass die Arme gerade hinter dem Oberkörper hängen.',
        'Halte die Oberarme ruhig und curle die Kurzhanteln mit nach oben gedrehten Handflächen.',
        'Senke die Hanteln ganz ab, bis du eine tiefe Dehnung im Bizeps spürst.',
      ],
    },
    'ex-hammer-curl': {
      name: 'Hammercurls (Kurzhanteln)',
      description:
        'Curls im Neutralgriff für Brachialis, Oberarmspeichenmuskel und Bizeps – für kräftigere Arme und Unterarme.',
      instructions: [
        'Halte die Kurzhanteln im Neutralgriff (Handflächen zeigen zueinander).',
        'Curle die Gewichte nach oben, die Handflächen bleiben neutral, die Ellbogen fest am Körper.',
        'Senke die Hanteln kontrolliert bis zur vollen Streckung ab.',
      ],
    },
    'ex-barbell-curl': {
      name: 'Bizepscurls (Langhantel)',
      description: 'Langhantelübung für den Bizeps, unterstützt von den Unterarmen.',
      instructions: [
        'Stelle dich aufrecht hin und halte eine Langhantel schulterbreit.',
        'Die Handflächen zeigen nach vorne, die Ellbogen sind nah am Oberkörper.',
        'Spanne den Bizeps an, um das Gewicht nach oben zu curlen.',
        'Die Oberarme bleiben dabei ruhig.',
        'Führe die Bewegung fort, bis der Bizeps vollständig kontrahiert ist und die Stange auf Schulterhöhe ist.',
        'Halte die Position eine Sekunde und spanne den Bizeps kräftig an.',
        'Senke die Langhantel langsam zurück in die Ausgangsposition.',
        'Wiederhole für die gewünschte Anzahl an Wiederholungen.',
      ],
    },
    'ex-seated-dumbbell-curl': {
      name: 'Bizepscurls sitzend (Kurzhanteln)',
      description: 'Kurzhantelübung für den Bizeps, unterstützt von den Unterarmen.',
      instructions: [
        'Setze dich mit je einer Kurzhantel in der Hand auf eine Flachbank und lass die Arme seitlich hängen, die Handflächen zeigen zueinander.',
        'Halte die Oberarme ruhig, curle die Gewichte und drehe die Handgelenke, sobald die Hanteln die Oberschenkel passieren, sodass die Handflächen am Ende nach vorne zeigen.',
        'Senke die Kurzhanteln beim Einatmen langsam ab und drehe die Handgelenke dabei zurück in den Neutralgriff.',
      ],
    },
    'ex-cable-curl': {
      name: 'Bizepscurls am Kabelzug (stehend)',
      description: 'Kabelübung für den Bizeps, unterstützt von den Unterarmen.',
      instructions: [
        'Stelle dich mit aufrechtem Oberkörper hin und halte eine Curlstange, die am unteren Seilzug befestigt ist.',
        'Greife die Stange schulterbreit mit den Handflächen nach oben, die Ellbogen bleiben nah am Körper.',
        'Halte die Oberarme ruhig und curle das Gewicht beim Ausatmen, indem du den Bizeps anspannst.',
        'Führe die Bewegung fort, bis der Bizeps vollständig kontrahiert ist.',
        'Halte kurz und senke die Stange beim Einatmen langsam in die Ausgangsposition ab.',
      ],
    },
    'ex-ez-bar-preacher-curl': {
      name: 'Scottcurls (SZ-Stange)',
      description: 'SZ-Stangen-Übung für den Bizeps, unterstützt von den Unterarmen.',
      instructions: [
        'Greife eine SZ-Stange im Untergriff.',
        'Positioniere die Hände an der ersten Griffbiegung von der Mitte aus.',
        'Lege die Oberarme und die Brust an das Polster der Scottbank und halte die SZ-Stange auf Schulterhöhe.',
        'Senke die Stange ab, ohne die Oberarme zu bewegen – nur die Unterarme bewegen sich.',
        'Lass die Unterarme ganz nach unten, bis sie mit dem Oberarm eine Linie bilden.',
        'Curle das Gewicht zurück in die Ausgangsposition.',
      ],
    },
    'ex-machine-preacher-curl': {
      name: 'Scottcurls (Maschine)',
      description: 'Maschinenübung für den Bizeps.',
      instructions: [
        'Setze dich an die Scottcurl-Maschine und wähle das Gewicht.',
        'Lege die Rückseite der Oberarme auf das Polster und greife die Griffe im Untergriff.',
        'Das ist die Ausgangsposition.',
        'Hebe die Griffe beim Ausatmen an, während du den Bizeps anspannst.',
        'Halte die Kontraktion am höchsten Punkt eine Sekunde.',
        'Senke die Griffe zurück in die Ausgangsposition.',
      ],
    },
    'ex-overhead-cable-curl': {
      name: 'Bizepscurls am oberen Kabelzug',
      description: 'Kabelübung für den Bizeps.',
      instructions: [
        'Stelle dich mittig zwischen zwei obere Seilzüge und greife mit jeder Hand einen Griff.',
        'Die Oberarme sind parallel zum Boden, die Handflächen zeigen zu dir.',
        'Das ist die Ausgangsposition für die Übung.',
        'Spanne den Bizeps auf beiden Seiten langsam an, bis sich Unterarme und Bizeps berühren, und atme dabei aus.',
        'Führe die Arme langsam zurück in die Ausgangsposition.',
      ],
    },
    'ex-cable-tricep-pushdown': {
      name: 'Trizepsdrücken am Seil (Kabelzug)',
      description:
        'Gelenkschonende Ellbogenstreckung mit Betonung des seitlichen und mittleren Trizepskopfes.',
      instructions: [
        'Befestige ein Seil am oberen Seilzug und fixiere die Ellbogen seitlich an den Rippen.',
        'Strecke die Unterarme nach unten und ziehe die Seilenden bei voller Streckung auseinander.',
        'Führe die Rückbewegung kontrolliert aus, bis die Unterarme knapp über der Waagerechten sind.',
      ],
    },
    'ex-overhead-cable-tricep-extension': {
      name: 'Trizepsstrecken über Kopf (Kabelzug)',
      description:
        'Trainiert den Trizeps bei angehobenem Arm, um den langen Kopf maximal zu dehnen und zu reizen.',
      instructions: [
        'Stelle dich mit dem Rücken zu einem Seilzug auf Hüft- bis Schulterhöhe und halte ein Seil über dem Kopf.',
        'Die Ellbogen zeigen nach vorne – strecke die Arme über dem Kopf vollständig durch.',
        'Lass bei jeder Absenkphase eine tiefe Dehnung hinter dem Kopf zu.',
      ],
    },
    'ex-close-grip-bench-press': {
      name: 'Enges Bankdrücken',
      description: 'Langhantelübung für den Trizeps, unterstützt von Brust und Schultern.',
      instructions: [
        'Lege dich auf eine Flachbank.',
        'Hebe die Stange mit engem Griff (etwa schulterbreit) aus der Ablage und halte sie mit gestreckten Armen über dir.',
        'Senke die Stange durch Beugen der Ellbogen zum Brustbein ab.',
        'Bleibe kontrolliert und lass die Stange nicht von der Brust abfedern.',
        'Sobald die Stange den Oberkörper berührt, strecke die Ellbogen und drücke sie zurück in die Ausgangsposition.',
      ],
    },
    'ex-dumbbell-skull-crusher': {
      name: 'French Press liegend (Kurzhanteln)',
      description: 'Kurzhantelübung für den Trizeps, unterstützt von den Schultern.',
      instructions: [
        'Lege dich auf eine Flachbank und halte zwei Kurzhanteln direkt über den Schultern.',
        'Die Arme sind vollständig gestreckt und stehen im 90-Grad-Winkel zum Oberkörper und zum Boden.',
        'Die Handflächen zeigen nach innen, die Ellbogen bleiben nah am Körper.',
        'Das ist die Ausgangsposition.',
        'Senke die Kurzhanteln langsam ab, bis sie sich neben den Ohren befinden.',
        'Atme dabei ein und halte die Oberarme ruhig.',
        'Bringe das Gewicht mit dem Trizeps zurück in die Ausgangsposition.',
        'Atme bei diesem Teil der Übung aus.',
      ],
    },
    'ex-seated-overhead-dumbbell-extension': {
      name: 'Trizepsstrecken über Kopf sitzend (Kurzhantel)',
      description: 'Kurzhantelübung für den Trizeps.',
      instructions: [
        'Setze dich auf eine Bank mit Rückenlehne.',
        'Greife eine Kurzhantel mit beiden Händen an einem Ende.',
        'Die Handflächen zeigen nach innen.',
        'Halte die Kurzhantel mit vollständig gestreckten Armen über dem Kopf.',
        'Das ist die Ausgangsposition.',
        'Halte die Oberarme nah am Kopf (Bizeps etwa auf Höhe der Schläfen) und nahezu senkrecht zum Boden.',
        'Bewege nur die Unterarme und senke die Kurzhantel in einem gleichmäßigen Bogen hinter den Kopf, bis sich Unterarme und Bizeps berühren.',
        'Halte einen Moment.',
      ],
    },
    'ex-single-arm-overhead-dumbbell-extension': {
      name: 'Einarmiges Trizepsstrecken über Kopf (Kurzhantel)',
      description: 'Kurzhantelübung für den Trizeps.',
      instructions: [
        'Setze dich mit aufrechtem Rücken auf eine Bank, die Füße fest am Boden, eine Kurzhantel in einer Hand.',
        'Hebe die Kurzhantel an, bis der Arm vollständig gestreckt ist.',
        'Senke die Kurzhantel hinter den Kopf ab.',
      ],
    },
    'ex-dumbbell-kickback': {
      name: 'Trizeps-Kickbacks (Kurzhantel)',
      description: 'Kurzhantelübung für den Trizeps, unterstützt von den Unterarmen.',
      instructions: [
        'Stütze ein Knie und eine Hand auf einer Flachbank ab, das andere Bein steht fest auf dem Boden.',
        'Der Rücken ist gerade, der Oberkörper parallel zur Bank.',
        'Halte eine Kurzhantel in der freien Hand, die Handfläche zeigt nach innen.',
        'Der Arm ist im 90-Grad-Winkel gebeugt, sodass die Kurzhantel neben der Hüfte und der Oberarm parallel zum Boden ist.',
        'Das ist die Ausgangsposition.',
        'Atme aus und strecke den Arm, ohne den Oberarm zu bewegen, vollständig nach hinten, bis der gesamte Arm parallel zum Boden ist.',
        'Halte kurz und kehre die Bewegung langsam bis zur Ausgangsposition um.',
      ],
    },
    'ex-triceps-dip': {
      name: 'Dips (Trizeps)',
      description: 'Körpergewichtsübung für den Trizeps, unterstützt von Brust und Unterarmen.',
      instructions: [
        'Stütze dich mit den Händen auf den Dip-Holmen ab, der Körper zeigt nach außen.',
        'Beuge die Ellbogen und senke den Körper ab, bis die Arme einen 90-Grad-Winkel bilden.',
        'Drücke dich wieder nach oben und ziehe dann die Knie zur Hüfte.',
        'Senke die Beine wieder ab.',
        'Damit ist eine Wiederholung abgeschlossen.',
      ],
    },
    'ex-bench-dip': {
      name: 'Bank-Dips',
      description: 'Körpergewichtsübung für den Trizeps, unterstützt von Brust und Schultern.',
      instructions: [
        'Stütze dich zwischen zwei Flachbänken ab: Die Hände liegen hinter dem Rücken auf der einen Bank, die Fersen gekreuzt vor dir auf der anderen.',
        'In der Ausgangsposition sind die Arme vollständig gestreckt, die Beine parallel zum Boden.',
        'Oberkörper und Beine bilden einen 90-Grad-Winkel.',
        'Lass dir von einem Trainingspartner eine Hantelscheibe auf den Schoß legen.',
        'Senke den Körper beim Einatmen langsam durch Beugen der Ellbogen ab, bis der Winkel zwischen Ober- und Unterarm etwas kleiner als 90 Grad ist.',
        'Drücke dich beim Ausatmen zurück in die Ausgangsposition.',
      ],
    },
    'ex-reverse-grip-cable-pushdown': {
      name: 'Einarmiges Trizepsdrücken im Untergriff (Kabelzug)',
      description: 'Kabelübung für den Trizeps.',
      instructions: [
        'Greife den Griff fest, die Handfläche zeigt nach oben.',
        'Halte den Ellbogen eng am Körper und drücke nach unten, bis der Arm vollständig gestreckt ist.',
        'Kehre langsam in die Ausgangsposition zurück und wiederhole.',
      ],
    },
    'ex-barbell-wrist-curl': {
      name: 'Handgelenkcurls sitzend',
      description:
        'Direkte Beugung des Handgelenks für den Aufbau der Unterarmbeuger und mehr Griffausdauer.',
      instructions: [
        'Lege die Unterarme auf die Oberschenkel oder eine Flachbank, die Handgelenke ragen über die Kante, Handflächen nach oben.',
        'Lass die Stange zu den Fingern rollen und curle die Handgelenke dann so weit wie möglich nach oben.',
      ],
    },

    // ── LEGS ─────────────────────────────────────────────────────────────────
    'ex-barbell-back-squat': {
      name: 'Kniebeuge (Langhantel)',
      description:
        'Königin der Beinübungen für Quadrizeps, Gesäß, Adduktoren und eine stabile Rumpfspannung.',
      instructions: [
        'Lege die Langhantel auf den oberen Trapezmuskel, hebe sie aus und mache 2–3 kontrollierte Schritte zurück.',
        'Atme tief in den Bauch ein, spanne den Rumpf an und setze dich zwischen Hüfte und Knie nach unten.',
        'Gehe so tief, bis die Hüftfalte unter Kniehöhe ist, und drücke dich dann gleichmäßig über den Mittelfuß nach oben.',
      ],
    },
    'ex-leg-press': {
      name: 'Beinpresse (45 Grad)',
      description:
        'Schwere Grundübung für die Beine ohne Belastung der Wirbelsäule, die gezielt Quadrizeps und Gesäß fordert.',
      instructions: [
        'Setze dich fest in den Sitz, unterer Rücken und Gesäß bleiben jederzeit am Polster.',
        'Stelle die Füße hüftbreit auf die Plattform, löse die Sicherungen und senke ab, bis die Knie etwa 90 Grad oder tiefer erreichen, ohne dass sich das Becken abrollt.',
        'Drücke die Plattform wieder nach oben, ohne die Knie durchzustrecken.',
      ],
    },
    'ex-bulgarian-split-squat': {
      name: 'Bulgarische Kniebeuge (Kurzhanteln)',
      description:
        'Einbeinige Kniebeuge-Variante für Kraft in Quadrizeps und Gesäß, die Seitenunterschiede ausgleicht.',
      instructions: [
        'Lege den hinteren Fuß mit dem Spann auf eine Bank hinter dir und halte die Kurzhanteln seitlich am Körper.',
        'Senke das hintere Knie Richtung Boden, das meiste Gewicht bleibt auf dem vorderen Bein.',
        'Drücke dich über den Mittelfuß des vorderen Beins zurück nach oben.',
      ],
    },
    'ex-leg-extension': {
      name: 'Beinstrecker (sitzend)',
      description:
        'Isolationsübung für die Kniestreckung, die den geraden Oberschenkelmuskel zusammen mit den übrigen Quadrizepsköpfen trainiert.',
      instructions: [
        'Richte den Drehpunkt der Maschine an deinem Kniegelenk aus und positioniere das Fußpolster knapp über den Füßen.',
        'Strecke die Beine vollständig, halte die Spannung im Quadrizeps 1 Sekunde und senke langsam ab.',
      ],
    },
    'ex-bodyweight-squat': {
      name: 'Kniebeuge (Körpergewicht)',
      description: 'Körpergewichtsübung für den Quadrizeps, unterstützt von Rumpf und Waden.',
      instructions: [
        'Stelle dich hüftbreit hin.',
        'Die Zehen zeigen gerade nach vorne oder nur leicht nach außen.',
        'Verschränke die Arme vor dem Körper, lege die Hände hinter den Kopf (Prisoner Squat) oder seitlich an den Kopf.',
        'Verlagere das Gewicht auf die Fersen, beuge die Knie und senke die Hüfte Richtung Boden, als würdest du dich auf einen Stuhl setzen.',
        'Halte den Rücken jederzeit gerade.',
        'Gehe so weit, bis du eine leichte Dehnung im Quadrizeps spürst.',
        'Halte einen Moment.',
        'Lass die Knie nicht über die Zehenspitzen hinauswandern.',
      ],
    },
    'ex-dumbbell-lunge': {
      name: 'Ausfallschritte (Kurzhanteln)',
      description: 'Kurzhantelübung für den Quadrizeps, unterstützt von Rumpf und Waden.',
      instructions: [
        'Nimm in jede Hand eine Kurzhantel und halte sie mit gestreckten Armen seitlich am Körper.',
        'Mache mit dem rechten Bein einen großen Schritt (ca. 60 cm) nach vorne, der hintere Fuß bleibt stehen, und senke den Körper ab.',
        'Gehe zurück in die Ausgangsposition.',
      ],
    },
    'ex-barbell-lunge': {
      name: 'Ausfallschritte (Langhantel)',
      description: 'Langhantelübung für den Quadrizeps, unterstützt von Rumpf und Waden.',
      instructions: [
        'Stelle dich aufrecht und schulterbreit hin, die Langhantel liegt auf den Schultern, die Hände greifen die Stange beidseitig mit den Handflächen nach vorne.',
        'Mache mit dem rechten Bein einen Schritt nach vorne und senke die Hüfte ab, der Oberkörper bleibt aufrecht und im Gleichgewicht.',
        'Gehe mit einem Schritt zurück in die Ausgangsposition und wiederhole die Bewegung mit dem anderen Bein.',
      ],
    },
    'ex-goblet-squat': {
      name: 'Goblet Squat',
      description: 'Kurzhantelübung für den Quadrizeps, unterstützt von Rumpf und Waden.',
      instructions: [
        'Stelle dich aufrecht hin und halte eine leichte Kurzhantel nah vor der Brust.',
        'Das ist die Ausgangsposition.',
        'Gehe in die Hocke, bis die hinteren Oberschenkel auf den Waden aufliegen.',
        'Halte unten kurz inne und drücke die Knie mit den Ellbogen nach außen.',
        'Kehre in die Ausgangsposition zurück.',
      ],
    },
    'ex-smith-machine-squat': {
      name: 'Kniebeuge an der Multipresse',
      description: 'Übung an der Multipresse für den Quadrizeps, unterstützt von den Waden.',
      instructions: [
        'Stelle dich mit leicht nach außen gedrehten Füßen hin, die Stange liegt auf den Schultern.',
        'Beuge die Knie auf etwa 90 Grad und drücke dich wieder nach oben.',
        'Halte den Rücken gerade und blicke während der gesamten Übung geradeaus.',
      ],
    },
    'ex-romanian-deadlift': {
      name: 'Rumänisches Kreuzheben (Langhantel, RDL)',
      description:
        'Kraftvolle Hüftbeuge-Übung, die hintere Oberschenkel und Gesäß unter tiefer Dehnung belastet.',
      instructions: [
        'Nimm die Langhantel auf Hüfthöhe aus dem Ständer, beuge die Knie leicht (ca. 15 Grad) und halte die Stange am Oberschenkel.',
        'Schiebe die Hüfte gerade nach hinten, bis die Stange auf Höhe des Schienbeins ist und die hinteren Oberschenkel maximal gedehnt sind.',
        'Schiebe die Hüfte nach vorne und richte dich auf, ohne den unteren Rücken zu überstrecken.',
      ],
    },
    'ex-seated-leg-curl': {
      name: 'Beinbeuger (sitzend)',
      description:
        'Trainiert die Kniebeugung bei gebeugter Hüfte – die zweigelenkigen hinteren Oberschenkelmuskeln arbeiten in optimal gedehnter Position.',
      instructions: [
        'Fixiere das Oberschenkelpolster fest über dem Quadrizeps, sodass sich das Becken nicht anheben kann.',
        'Ziehe die Fersen unter den Sitz, halte kurz inne und kontrolliere die Rückbewegung.',
      ],
    },
    'ex-lying-leg-curl': {
      name: 'Beinbeuger (liegend)',
      description:
        'Beinbeuger in Bauchlage, der den Bizeps femoris, Semitendinosus und Semimembranosus bei gestreckter Hüfte isoliert.',
      instructions: [
        'Lege dich bäuchlings auf die Beinbeuger-Bank, das Rollenpolster knapp über den Fersen, die Knie am Drehpunkt ausgerichtet.',
        'Drücke die Hüfte ins Polster und beuge die Unterschenkel, bis das Polster Gesäß bzw. obere hintere Oberschenkel erreicht.',
        'Halte die Spannung 1 Sekunde und senke dann über 2–3 Sekunden kontrolliert ab.',
      ],
    },
    'ex-standing-leg-curl': {
      name: 'Beinbeuger (stehend)',
      description: 'Maschinenübung für die hinteren Oberschenkel, unterstützt vom Gesäß.',
      instructions: [
        'Stelle dich so an die Beinbeuger-Maschine, dass die Knie an den Kniepolstern und die Brust am Brustpolster anliegen. Lege die Rückseite des rechten Beins unter das Polster, sodass die Wade dagegen drückt und die Zehen gestreckt sind.',
        'Beuge das rechte Bein so weit wie möglich, ohne den Oberschenkel vom Polster zu lösen.',
        'Halte kurz und bringe das Bein zurück in die Ausgangsposition.',
      ],
    },
    'ex-barbell-hip-thrust': {
      name: 'Hip Thrust (Langhantel)',
      description:
        'Gezielte horizontale Hüftstreckung für maximale Spannung im großen Gesäßmuskel bei voller Hüftstreckung.',
      instructions: [
        'Lehne den oberen Rücken (knapp unter den Schulterblättern) an eine stabile Bank, eine gepolsterte Langhantel liegt über der Hüfte.',
        'Ziehe das Kinn leicht ein, halte die Rippen unten und drücke dich über die Fersen hoch, bis die Oberschenkel parallel zum Boden sind.',
        'Halte die Gesäßspannung oben 1–2 Sekunden.',
      ],
    },
    'ex-hip-adduction-abduction': {
      name: 'Hüftabduktion / Hüftadduktion (Maschine)',
      description:
        'Abduktion und Adduktion an der Maschine im Sitzen – stärkt mittleren/kleinen Gesäßmuskel und die Adduktoren für ein stabiles Becken.',
      instructions: [
        'Setze dich aufrecht in die Maschine, der Rücken am Polster, und stelle die Kniepolster bequem ein.',
        'Drücke die Knie nach außen (Abduktion) oder ziehe sie nach innen (Adduktion) – gleichmäßig über den vollen Bewegungsumfang.',
        'Halte am Endpunkt 1 Sekunde und kontrolliere die Rückbewegung, ohne den Gewichtsstapel aufschlagen zu lassen.',
      ],
    },
    'ex-glute-bridge': {
      name: 'Glute Bridge (Beckenheben)',
      description: 'Körpergewichtsübung für das Gesäß, unterstützt von Rumpf und Rücken.',
      instructions: [
        'Lege dich flach auf den Rücken, die Hände neben dem Körper, die Knie gebeugt.',
        'Die Füße stehen etwa schulterbreit auseinander.',
        'Spanne das Gesäß an und hebe die Hüfte, bis der Körper von den Knien bis zu den Schultern eine gerade Linie bildet.',
        'Halte mindestens 5 Sekunden und senke dich dann wieder ab.',
      ],
    },
    'ex-weighted-glute-bridge': {
      name: 'Glute Bridge mit Gewicht',
      description:
        'Langhantelübung für das Gesäß, unterstützt von Rumpf und hinterem Oberschenkel.',
      instructions: [
        'Lege dich mit dem Rücken auf eine Trainingsmatte, die Arme gestreckt neben dem Körper.',
        'Lege eine Hantelscheibe auf die Hüfte und halte sie mit den Händen fest.',
        'Drücke dich über die Fersen nach oben und strecke die Hüfte senkrecht gegen das Gewicht.',
        'Strecke die Hüfte so weit wie möglich und kehre die Bewegung dann bis zur Ausgangsposition um.',
      ],
    },
    'ex-standing-calf-raise': {
      name: 'Wadenheben (stehend)',
      description:
        'Fußstreckung mit gestreckten Knien, die Zwillingswadenmuskel und Schollenmuskel über die volle Dehnung trainiert.',
      instructions: [
        'Stelle die Fußballen auf die Plattform, die Knie gestreckt (nicht überstreckt).',
        'Senke die Fersen ab und halte die Dehnung unten 2 Sekunden, dann drücke dich hoch auf die Fußballen.',
      ],
    },
    'ex-seated-calf-raise': {
      name: 'Wadenheben (sitzend)',
      description:
        'Fußstreckung mit gebeugten Knien, die den Schollenmuskel unter dem Zwillingswadenmuskel isoliert – für eine vollständig entwickelte Wade.',
      instructions: [
        'Setze dich an die Maschine, die Fußballen auf der Stufe, das Oberschenkelpolster liegt eng knapp über den Knien.',
        'Senke die Fersen so weit, wie es deine Sprunggelenksbeweglichkeit zulässt, halte die Dehnung 2 Sekunden und drücke dich dann bis zur vollen Kontraktion hoch.',
      ],
    },
    'ex-hanging-leg-raise': {
      name: 'Beinheben im Hang',
      description:
        'Dynamische Beugung von Wirbelsäule und Hüfte für den geraden Bauchmuskel und die Hüftbeuger.',
      instructions: [
        'Hänge dich mit aktiv stabilisierten Schultern an eine Klimmzugstange.',
        'Rolle das Becken beim Anheben der Beine Richtung Rippen ein und vermeide Schwung.',
        'Senke die Beine langsam in die Ausgangsposition ab.',
      ],
    },
    'ex-cable-crunch': {
      name: 'Kniender Crunch am Kabelzug',
      description:
        'Rumpfbeugung mit Gewicht, die eine progressive Steigerung für den geraden Bauchmuskel ermöglicht.',
      instructions: [
        'Knie dich unter einen oberen Seilzug und halte das Seil neben den Schläfen.',
        'Beuge die Wirbelsäule, indem du das Brustbein Richtung Becken einrollst, die Hüfte bleibt dabei ruhig.',
      ],
    },
    'ex-kettlebell-hip-flexor-march': {
      name: 'Hüftbeuger-Marsch im Stand (Psoas)',
      description:
        'Gezielte Kräftigung der Hüftbeugung für Iliopsoas und geraden Oberschenkelmuskel – für bessere Sprintmechanik und Hüftstabilität.',
      instructions: [
        'Lege ein Miniband um die Füße oder nutze eine leichte Kettlebell und stelle dich aufrecht neben ein Rack.',
        'Ziehe ein Knie über 90 Grad Hüftbeugung nach oben, halte es 2 Sekunden bei aufrechter Haltung und senke es dann ab.',
      ],
    },
    'ex-conventional-deadlift': {
      name: 'Kreuzheben (Langhantel, klassisch)',
      description:
        'Ganzkörperzug für die gesamte hintere Kette: Gesäß, hintere Oberschenkel, Rückenstrecker, Trapez, Latissimus und Griffkraft.',
      instructions: [
        'Stelle dich so hin, dass der Mittelfuß unter der Stange ist, greife knapp außerhalb der Schienbeine und baue Spannung in der Stange auf.',
        'Spanne Latissimus und Rumpf an, drücke den Boden mit den Beinen weg und strecke Hüfte und Knie gleichzeitig durch.',
      ],
    },
    'ex-rowing-ergometer': {
      name: 'Rudergerät (Concept2)',
      description:
        'Gelenkschonendes Ganzkörper-Ausdauertraining für Beine, Rumpf und oberen Rücken.',
      instructions: [
        'Drücke zuerst mit den Beinen ab, lehne den Oberkörper leicht zurück und ziehe den Griff zum Schluss zu den unteren Rippen.',
        'Kehre in umgekehrter Reihenfolge zurück: Arme nach vorne, Oberkörper nach vorne neigen, dann die Knie beugen.',
      ],
    },
    'ex-crunch': {
      name: 'Crunch',
      description: 'Körpergewichtsübung für den Rumpf.',
      instructions: [
        'Lege dich auf den Rücken, beuge die Knie und lege die Hände hinter den Kopf oder vor der Brust übereinander.',
        'Spanne den Rumpf an.',
        'Rolle die Rippen mithilfe der Bauchmuskeln Richtung Becken ein und führe die Bewegung vollständig aus.',
        'Atme beim Hochkommen aus, halte den Nacken gerade und das Kinn leicht angehoben.',
        'Halte oben einige Sekunden und atme dabei gleichmäßig weiter.',
        'Senke dich langsam wieder ab.',
      ],
    },
    'ex-decline-crunch': {
      name: 'Crunch auf der Negativbank',
      description: 'Körpergewichtsübung für den Rumpf.',
      instructions: [
        'Fixiere die Beine am Ende der Negativbank und lege dich hin.',
        'Lege die Hände hinter den Kopf oder verschränke die Arme vor der Brust.',
        'Richte den Oberkörper bis in eine sitzende Position auf, halte kurz inne und senke dich wieder ab.',
      ],
    },
    'ex-machine-crunch': {
      name: 'Bauchmaschine (Crunch)',
      description: 'Maschinenübung für den Rumpf.',
      instructions: [
        'Wähle einen passenden Widerstand, setze dich an die Bauchmaschine, schiebe die Füße unter die Polster und greife die oberen Griffe.',
        'Die Arme sind im 90-Grad-Winkel gebeugt, die Rückseite der Oberarme liegt auf den Polstern.',
        'Das ist die Ausgangsposition.',
        'Spanne die Bauchmuskeln an und rolle dich beim Ausatmen ein.',
        'Beuge dich dazu in der Hüfte, senke die Griffe und hebe die Beine an.',
        'Richte den Oberkörper beim Einatmen wieder auf, ohne dass die Gewichte aufschlagen.',
        'Halte kurz inne und wiederhole.',
      ],
    },
    'ex-alternate-heel-touchers': {
      name: 'Wechselseitiges Fersentippen',
      description: 'Körpergewichtsübung für den Rumpf.',
      instructions: [
        'Lege dich auf den Boden oder eine Matte, die Knie gebeugt, die Füße etwa 45–60 cm auseinander auf dem Boden.',
        'Rolle dich beim Ausatmen leicht nach oben und einige Zentimeter zur rechten Seite, bis die rechte Hand die rechte Ferse berührt.',
        'Kehre beim Einatmen langsam in die Ausgangsposition zurück.',
        'Wiederhole auf der anderen Seite.',
      ],
    },
    'ex-flutter-kicks': {
      name: 'Flutter Kicks (Beinschlag)',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Gesäß.',
      instructions: [
        'Lege dich bäuchlings auf eine Flachbank, die Hüfte an der Bankkante, die Beine gestreckt.',
        'Beginne, indem du das linke Bein höher als das rechte anhebst.',
        'Senke dann das linke Bein ab, während du das rechte anhebst.',
        'Wechsle fortlaufend ab.',
      ],
    },
    'ex-elbow-to-knee-crunch': {
      name: 'Crunch Ellbogen zum Knie',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt von Gesäß und Quadrizeps.',
      instructions: [
        'Ziehe das linke Knie gebeugt und den rechten Ellbogen zusammen, sodass sie sich in der Körpermitte treffen.',
        'Kehre in die Ausgangsposition zurück und führe das rechte Knie zum linken Ellbogen.',
      ],
    },
    'ex-bird-dog': {
      name: 'Bird Dog (Vierfüßlerstand)',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Gesäß.',
      instructions: [
        'Begib dich in den Vierfüßlerstand, die Hände schulterbreit direkt unter den Schultern.',
        'Hebe gleichzeitig den rechten Arm und das linke Bein an, bis beide mit dem Rest des Körpers eine Linie bilden.',
        'Halte diese Position kurz und kehre dann in die Ausgangsposition zurück.',
        'Wiederhole mit dem anderen Bein und Arm.',
      ],
    },
    'ex-cable-core-rotation': {
      name: 'Rumpfrotation am Kabelzug',
      description: 'Kabelübung für den Rumpf.',
      instructions: [
        'Halte den Seilzug mit beiden Händen an deiner rechten Seite, sodass der linke Arm gestreckt quer vor dem Körper liegt.',
        'Ziehe den Seilzug unter Rotation des Oberkörpers zur anderen Seite, bis der rechte Arm gestreckt ist.',
        'Führe den Seilzug zurück in die Ausgangsposition und wiederhole.',
      ],
    },
    'ex-captains-chair-knee-raise': {
      name: 'Knieheben am Dip-Barren (Captain’s Chair)',
      description: 'Geräteübung für den Rumpf, unterstützt vom Rücken.',
      instructions: [
        'Lege die Unterarme auf die Polster bzw. Holme des Geräts und greife die Griffe.',
        'Die Arme sind um 90 Grad gebeugt, die Oberarme verlaufen gerade entlang der Körperseiten.',
        'Der Oberkörper ist gerade, der untere Rücken liegt – falls vorhanden – am Rückenpolster an.',
        'Halte die Beine gestreckt, sie zeigen nach unten zum Boden.',
        'Das ist die Ausgangsposition.',
        'Atme aus und hebe die Beine dabei in einem gleichmäßigen Bogen mit gebeugten Knien an, bis die Oberschenkel etwa parallel zum Boden sind.',
        'Halte einen Moment.',
        'Kehre beim Einatmen in einer gleichmäßigen, kontrollierten Bewegung in die Ausgangsposition zurück.',
      ],
    },
    'ex-side-plank': {
      name: 'Seitstütz',
      description: 'Körpergewichtsübung für den Rumpf.',
      instructions: [
        'Lege dich auf die rechte Seite, die Beine gestreckt und von der Hüfte bis zu den Füßen übereinander.',
        'Der rechte Ellbogen befindet sich direkt unter der Schulter.',
        'Achte darauf, dass der Kopf in Verlängerung der Wirbelsäule liegt.',
        'Der linke Arm kann an der linken Körperseite anliegen.',
        'Spanne die Bauchmuskeln an und ziehe den Bauchnabel Richtung Wirbelsäule.',
        'Hebe beim Ausatmen Hüfte und Knie von der Matte ab.',
        'Der Oberkörper bildet eine gerade Linie – nicht durchhängen oder abknicken.',
        'Halte die Position.',
      ],
    },
    'ex-side-jackknife': {
      name: 'Seitliches Klappmesser',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Gesäß.',
      instructions: [
        'Lege dich auf die linke Seite, die Beine gestreckt und übereinander.',
        'Lege den linken Arm vor dem Oberkörper auf die rechte Hüfte und die rechte Hand hinter den Kopf.',
        'Hebe gleichzeitig Oberkörper und Beine an und führe den Kopf Richtung Hüfte.',
        'Kehre kontrolliert in die Ausgangsposition zurück.',
      ],
    },
    'ex-jackknife-sit-up': {
      name: 'Klappmesser (Jackknife Sit-Up)',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Gesäß.',
      instructions: [
        'Lege dich mit dem Rücken auf eine Matte, die Beine geschlossen und vollständig gestreckt, die Arme nach hinten ausgestreckt, Handflächen nach unten.',
        'Beuge dich beim Ausatmen in der Hüfte und hebe gleichzeitig Beine und Arme an, sodass sie sich in der Klappmesser-Position treffen.',
        'Senke Arme und Beine beim Einatmen zurück in die Ausgangsposition.',
      ],
    },
    'ex-leg-pull-in': {
      name: 'Beine anziehen (Leg Pull-In)',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Rücken.',
      instructions: [
        'Lege dich mit gestreckten Beinen auf eine Matte, die Handflächen liegen neben dir am Boden oder unter dem Gesäß.',
        'Beuge die Knie und hebe die Beine an, sodass sie einen 90-Grad-Winkel bilden.',
        'Strecke die Beine aus und tippe mit den Zehen den Boden an, sodass du eine deutliche Spannung im unteren Bauch spürst.',
        'Kehre in die Ausgangsposition zurück.',
      ],
    },
    'ex-lying-leg-raise': {
      name: 'Beinheben liegend',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Rücken.',
      instructions: [
        'Lege dich flach auf den Rücken, die Beine gestreckt und geschlossen, die Hände neben dem Körper.',
        'Halte die Beine so gerade wie möglich und hebe die Füße 15–30 cm vom Boden ab.',
        'Halte die Position für eine festgelegte Zeit oder hebe die Beine an und senke sie direkt wieder ab.',
      ],
    },
    'ex-reverse-crunch': {
      name: 'Reverse Crunch',
      description: 'Körpergewichtsübung für den Rumpf, unterstützt vom Gesäß.',
      instructions: [
        'Lege dich mit dem Gesicht nach oben auf eine Flachbank.',
        'Lege die Hände hinter den Kopf und hebe den Kopf leicht an.',
        'Hebe die Beine an und beuge die Knie, sodass sie einen 90-Grad-Winkel bilden.',
        'Die Hüfte liegt dabei noch auf.',
        'Hebe die Hüfte von der Unterlage ab und rolle sie Richtung Kopf ein.',
        'Halte kurz inne, senke dich dann wieder ab und wiederhole.',
      ],
    },
    'ex-exercise-ball-crunch': {
      name: 'Crunch auf dem Gymnastikball',
      description: 'Geräteübung für den Rumpf.',
      instructions: [
        'Lege dich so auf einen Gymnastikball, dass der untere Rücken auf dem Ball aufliegt.',
        'Die Knie sind gebeugt, die Füße stehen flach auf dem Boden.',
        'In der richtigen Position hängt der obere Oberkörper über den Ball hinaus.',
        'Halte die Arme seitlich am Körper oder verschränke sie vor der Brust.',
        'Senke den Oberkörper in eine Dehnposition ab, der Nacken bleibt dabei ruhig.',
        'Das ist die Ausgangsposition.',
        'Halte die Hüfte ruhig und spanne die Bauchmuskeln an, um den Oberkörper einzurollen.',
        'Rolle Schultern und Rumpf nach oben, bis du eine Kontraktion in den Bauchmuskeln spürst.',
      ],
    },

    // ── STRETCHING & MOBILITY ────────────────────────────────────────────────
    'ex-couch-hip-flexor-stretch': {
      name: 'Couch Stretch (Hüftbeuger & Quadrizeps)',
      description:
        'Tiefe, zeitbasierte Dehnung für Iliopsoas und geraden Oberschenkelmuskel nach langem Sitzen oder schwerem Beintraining.',
      instructions: [
        'Setze das hintere Knie am Fuß einer Wand oder Bank ab, das Schienbein liegt senkrecht an der Fläche an.',
        'Stelle den vorderen Fuß in einen Ausfallschritt, kippe das Becken nach hinten (Gesäß des hinteren Beins anspannen) und atme tief.',
        'Halte 45–60 Sekunden pro Seite.',
      ],
    },
    'ex-90-90-hip-mobility': {
      name: '90/90 Hüftrotation (innen & außen)',
      description:
        'Aktiver Mobility-Flow für mehr Innen- und Außenrotation im Hüftgelenk – für tiefere, schmerzfreie Kniebeugen.',
      instructions: [
        'Setze dich auf den Boden, vorderes und hinteres Knie sind jeweils im 90-Grad-Winkel gebeugt.',
        'Neige dich mit geradem Rücken über das vordere Schienbein und rotiere dann gleichmäßig in die gegenüberliegende 90/90-Position.',
      ],
    },
    'ex-thoracic-open-book': {
      name: 'Open Book für die Brustwirbelsäule & Brustdehnung',
      description:
        'Stellt die Rotation der Brustwirbelsäule wieder her und öffnet verkürzte Brustmuskeln und vordere Schultern – vor oder nach Druckübungen.',
      instructions: [
        'Lege dich auf die Seite, das obere Knie im 90-Grad-Winkel gebeugt auf dem Boden oder einer Faszienrolle.',
        'Führe den oberen Arm beim langsamen Ausatmen in einem Bogen über den Körper Richtung Boden hinter dir.',
      ],
    },
    'ex-doorway-pec-stretch': {
      name: 'Brustdehnung im Türrahmen',
      description: 'Statische Dehnung, die verspannte Brust- und vordere Schulterfaszien löst.',
      instructions: [
        'Lege die Unterarme an einen Türrahmen oder einen Rack-Pfosten, die Ellbogen bei 90–110 Grad.',
        'Mache einen sanften Schritt nach vorne durch den Rahmen, bis du eine angenehme Dehnung in der Brust spürst, und halte 45 Sekunden.',
      ],
    },
    'ex-supine-hamstring-band-stretch': {
      name: 'Hamstring- & Wadendehnung mit Band (Rückenlage)',
      description:
        'Entlastete Dehnung der hinteren Kette für hintere Oberschenkel und Waden – ohne Belastung der Lendenwirbelsäule.',
      instructions: [
        'Lege dich auf den Rücken, lege ein Band um einen Fuß und strecke das Bein Richtung Decke.',
        'Spanne den Quadrizeps an und entspanne ihn wieder – in 5-Sekunden-PNF-Zyklen über 60 Sekunden.',
      ],
    },
    'ex-pigeon-glute-stretch': {
      name: 'Taube / Figure-4: Piriformis- & Gesäßdehnung',
      description:
        'Tiefe Hüftdehnung in Außenrotation, die mittleren Gesäßmuskel, Piriformis und tiefe Hüftrotatoren löst und den unteren Rücken entlastet.',
      instructions: [
        'Lege ein Schienbein quer vor die Hüfte (oder in Rückenlage den Knöchel über das gegenüberliegende Knie).',
        'Halte das Becken gerade und neige dich beim langsamen Ausatmen sanft aus der Hüfte nach vorne.',
        'Halte 45–60 Sekunden pro Seite, ohne Druck aufs Knie zu erzwingen.',
      ],
    },
    'ex-worlds-greatest-stretch': {
      name: 'World’s Greatest Stretch (Ausfallschritt & Rotation)',
      description:
        'Dynamischer Aufwärm-Flow in mehreren Ebenen, der gleichzeitig Hüftbeuger, Adduktoren, hintere Oberschenkel und die Rotation der Brustwirbelsäule öffnet.',
      instructions: [
        'Mache einen tiefen Ausfallschritt nach vorne und setze die gegenüberliegende Hand innen neben dem vorderen Fuß auf den Boden.',
        'Senke den inneren Ellbogen Richtung Innenseite des vorderen Fußes, rotiere dann den Oberkörper und strecke diesen Arm zur Decke.',
        'Schiebe die Hüfte kurz nach hinten, um den vorderen hinteren Oberschenkel zu dehnen, bevor du die Seite wechselst.',
      ],
    },
    'ex-butterfly-adductor-stretch': {
      name: 'Schmetterlingsdehnung (Leiste & Adduktoren, sitzend)',
      description:
        'Öffnet die Adduktoren an der Innenseite der Oberschenkel und den Beckenboden für einen breiteren, angenehmeren Stand bei Kniebeugen und Sumo.',
      instructions: [
        'Setze dich aufrecht auf den Boden, bringe die Fußsohlen zusammen und halte deine Knöchel fest.',
        'Drücke die Knie mit den Ellbogen sanft Richtung Boden, die Wirbelsäule bleibt neutral.',
        'Atme 45–60 Sekunden tief ins Becken.',
      ],
    },
    'ex-deep-squat-ankle-pry': {
      name: 'Tiefe Hocke & Sprunggelenk-Mobilisation',
      description:
        'Mobility-Drill für Sprunggelenk-Dorsalflexion und Hüftöffnung unter Last – wichtig für eine aufrechte Kniebeuge und saubere Knieführung.',
      instructions: [
        'Gehe in eine tiefe Kniebeuge mit flachen Fersen am Boden (halte dich bei Bedarf an einem Rack-Pfosten fest).',
        'Setze die Ellbogen innen an die Knie und verlagere das Gewicht sanft von Seite zu Seite über jedes Sprunggelenk, um das obere Sprunggelenk zu mobilisieren.',
        'Sammle insgesamt 60 Sekunden mit aufrechter Brust.',
      ],
    },
    'ex-standing-wall-calf-stretch': {
      name: 'Wadendehnung an der Wand (Gastrocnemius & Soleus)',
      description:
        'Dehnung der Fußhebung in zwei Positionen: löst Spannung im Zwillingswadenmuskel (gestrecktes Knie) und in Schollenmuskel/Achillessehne (gebeugtes Knie).',
      instructions: [
        'Stütze die Hände an einer Wand ab und setze einen Fuß nach hinten, die Ferse fest am Boden, das Knie gestreckt – 30 Sekunden halten.',
        'Beuge das hintere Knie leicht, die Ferse bleibt unten – weitere 30 Sekunden für Schollenmuskel und Achillessehne.',
      ],
    },
    'ex-standing-quad-stretch': {
      name: 'Quadrizepsdehnung (stehend / in Seitenlage)',
      description:
        'Dehnt den geraden Oberschenkelmuskel und die übrigen Quadrizepsköpfe und fördert ein nach hinten gekipptes Becken.',
      instructions: [
        'Stelle dich auf ein Bein (halte dich zur Balance an einem Rack fest), greife den gegenüberliegenden Knöchel und ziehe die Ferse zum Gesäß.',
        'Halte beide Knie nah beieinander und spanne das Gesäß leicht an, um ein Hohlkreuz zu vermeiden.',
      ],
    },
    'ex-seated-pike-hamstring-fold': {
      name: 'Vorbeuge im Sitzen (hintere Oberschenkel & hintere Kette)',
      description:
        'Statische Dehnung am Boden für hintere Oberschenkel, Waden und die thorakolumbale Faszie – ganz ohne Equipment.',
      instructions: [
        'Setze dich mit gestreckten Beinen auf den Boden, die Zehen zeigen nach oben.',
        'Neige dich aus der Hüftfalte nach vorne, halte die Brust lang und greife 45–60 Sekunden Richtung Schienbeine oder Füße.',
      ],
    },
    'ex-childs-pose-lat-stretch': {
      name: 'Kindhaltung mit seitlicher Lat-Dehnung',
      description:
        'Öffnet Latissimus, großen Rundmuskel und Brustwirbelsäule und entlastet sanft die Lendenwirbel.',
      instructions: [
        'Knie dich auf den Boden, setze das Gesäß auf die Fersen und strecke die Arme lang nach vorne.',
        'Wandere mit beiden Händen 30 Grad nach links, um 30 Sekunden den rechten Latissimus zu dehnen, dann 30 Sekunden nach rechts.',
      ],
    },
    'ex-cross-body-shoulder-stretch': {
      name: 'Schulterdehnung quer vor dem Körper (hintere Schulter)',
      description:
        'Löst Verspannungen in der hinteren Gelenkkapsel und der hinteren Schulter nach Druck- oder Rückentraining.',
      instructions: [
        'Führe einen Arm gestreckt auf Schulterhöhe quer vor die Brust, das Schulterblatt bleibt unten.',
        'Ziehe den Arm mit dem anderen Unterarm sanft näher zur Brust – 45 Sekunden pro Seite.',
      ],
    },
    'ex-overhead-tricep-lat-stretch': {
      name: 'Trizeps- & Flankendehnung über Kopf',
      description:
        'Dehnt den langen Trizepskopf und den oberen Latissimus bei voll angehobenem Arm.',
      instructions: [
        'Strecke einen Arm über den Kopf und beuge den Ellbogen, sodass die Hand den oberen Rücken zwischen den Schulterblättern berührt.',
        'Drücke den Ellbogen sanft nach hinten und neige dich leicht zur Gegenseite – 45 Sekunden pro Arm.',
      ],
    },
    'ex-dead-hang-shoulder-decompression': {
      name: 'Passives Hängen (Schulter- & Wirbelsäulenentlastung)',
      description:
        'Hängen unter Zug, das den Raum unter dem Schulterdach öffnet, Latissimus und Brust dehnt und die Bandscheiben entlastet.',
      instructions: [
        'Greife eine Klimmzugstange schulterbreit im Obergriff und lass den Körper mit entspannter Hüfte und lockeren Beinen hängen.',
        'Lass die Schultern sanft Richtung Ohren steigen und atme 45–60 Sekunden langsam in 4-Sekunden-Zügen durch die Nase.',
      ],
    },
    'ex-kneeling-wrist-forearm-stretch': {
      name: 'Handgelenk-Mobilisation im Knien (Beuger & Strecker)',
      description:
        'Stellt die Streckfähigkeit der Handgelenke und die Elastizität der Unterarmbeuger wieder her – für schmerzfreies Bankdrücken, Liegestütze und Front Squats.',
      instructions: [
        'Begib dich in den Vierfüßlerstand und lege die Handflächen flach auf den Boden, die Finger zeigen nach hinten zu den Knien.',
        'Schiebe die Hüfte langsam einige Zentimeter nach hinten, bis du 45 Sekunden lang eine gleichmäßige Dehnung an der Innenseite der Unterarme spürst.',
      ],
    },
    'ex-cat-cow-spinal-flow': {
      name: 'Katze-Kuh (Wirbelsäulenmobilisation)',
      description:
        'Rhythmischer Wechsel aus Beugung und Streckung, der die Facettengelenke von Hals-, Brust- und Lendenwirbelsäule mobilisiert.',
      instructions: [
        'Beginne im Vierfüßlerstand, die Hände unter den Schultern, die Knie unter der Hüfte.',
        'Lass beim Einatmen den Bauch sinken und hebe das Brustbein (Kuh), drücke beim Ausatmen den Boden weg und runde die Wirbelsäule (Katze).',
        'Wechsle 10–12 Atemzüge lang (ca. 60 Sekunden) fließend zwischen beiden Positionen.',
      ],
    },
    'ex-supine-knee-to-chest-twist': {
      name: 'Knie zur Brust in Rückenlage (Lendenwirbelsäule entlasten)',
      description:
        'Sanfte Entlastung am Boden, die Rückenstrecker im Lendenbereich, Iliosakralgelenk und großen Gesäßmuskel nach schweren Kniebeugen oder Kreuzheben löst.',
      instructions: [
        'Lege dich flach auf den Rücken und ziehe beide Knie (oder abwechselnd ein Knie) sanft zur Brust.',
        'Schaukle 60 Sekunden langsam über das Kreuzbein von Seite zu Seite und atme dabei tief in den Bauch.',
      ],
    },
    'ex-neck-upper-trap-release': {
      name: 'Seitliche Nacken- & Trapezdehnung',
      description:
        'Löst Verspannungen in der Halswirbelsäule, im oberen Trapez und im Schulterblattheber durch Schreibtischarbeit oder schwere Shrugs.',
      instructions: [
        'Setze oder stelle dich aufrecht hin und lege eine Hand hinter den unteren Rücken, um die Schulter nach unten zu ziehen.',
        'Neige das Ohr sanft zur gegenüberliegenden Schulter, bis du eine leichte Dehnung an der Halsseite spürst – 45 Sekunden pro Seite.',
      ],
    },
  },
  folders: {
    'folder-4er-split': '4er-Split (Muskelaufbau)',
    'folder-ppl-split': 'Push / Pull / Beine (PPL)',
    'folder-5er-brosplit': '5er-Split (Bro-Split)',
  },
  templates: {
    'tpl-chest-triceps': {
      name: 'Tag 1 — Brust & Trizeps',
      description:
        'Schweres Flach- und Schrägbankdrücken kombiniert mit Übungen für den langen und seitlichen Trizepskopf.',
    },
    'tpl-back-biceps': {
      name: 'Tag 2 — Rücken & Bizeps',
      description:
        'Vertikales Ziehen für einen breiten Latissimus, horizontales Rudern für einen dichten mittleren Rücken und Bizepscurls in gedehnter Position.',
    },
    'tpl-legs': {
      name: 'Tag 3 — Beine & hintere Kette',
      description:
        'Kniebeuge, Hüftbeuge mit rumänischem Kreuzheben, einbeiniges Training für Quadrizeps und Gesäß sowie Waden.',
    },
    'tpl-shoulders-core': {
      name: 'Tag 4 — Schultern & Rumpf',
      description:
        'Schulterdrücken, Volumen für seitliche und hintere Schulter, Bauch und Kraft in den Hüftbeugern.',
    },
    'tpl-ppl-push': {
      name: 'Push — Brust, Schultern & Trizeps',
      description:
        'Komplette Drück-Einheit für Brust, vordere und seitliche Schulter sowie Trizeps.',
    },
    'tpl-ppl-pull': {
      name: 'Pull — Rücken, hintere Schulter & Bizeps',
      description:
        'Vertikales und horizontales Ziehen kombiniert mit Muskelaufbau für hintere Schulter und Bizeps.',
    },
    'tpl-ppl-legs': {
      name: 'Beine — Quadrizeps, Beinbeuger, Gesäß & Waden',
      description:
        'Intensive Beineinheit mit ausgewogener Belastung von Quadrizeps und hinterer Kette.',
    },
    'tpl-bro-chest': {
      name: 'Tag 1 — Brust',
      description: 'Gezielter Brustaufbau über Flachbank, Schrägbank, Maschine und Kabelzug.',
    },
    'tpl-bro-back': {
      name: 'Tag 2 — Rücken',
      description:
        'Komplette Einheit für Rückendicke und Latissimus-Breite – vom Kreuzheben bis zum vertikalen Ziehen.',
    },
    'tpl-bro-shoulders': {
      name: 'Tag 3 — Schultern & Rumpf',
      description:
        'Volumen für alle drei Schulterköpfe (vorne, seitlich, hinten) plus Bauchtraining mit Gewicht.',
    },
    'tpl-bro-legs': {
      name: 'Tag 4 — Beine & Waden',
      description:
        'Beintag mit hohem Volumen für Quadrizeps, Beinbeuger, Gesäß, Adduktoren und Waden.',
    },
    'tpl-bro-arms': {
      name: 'Tag 5 — Arm-Tag (Bizeps & Trizeps)',
      description: 'Gezielter Armaufbau mit Bizeps-/Trizeps-Supersätzen und Unterarmtraining.',
    },
  },
  routines: {
    'stretch-lower-body-flow': {
      name: 'Hüft-, Gesäß- & Beinbeuger-Flow nach dem Beintag',
      description:
        'Entlastet die Lendenwirbelsäule, öffnet verkürzte Hüftbeuger, löst den Piriformis und stellt die Innen- und Außenrotation der Hüfte wieder her.',
      targetArea: 'Unterkörper & Hüfte',
    },
    'stretch-upper-thoracic-reset': {
      name: 'Oberkörper-, Brust- & BWS-Öffner',
      description:
        'Ideal vor oder nach Drück-Einheiten, um Brust, Latissimus, Schultern und Brustwirbelsäule zu öffnen.',
      targetArea: 'Oberkörper & Brustwirbelsäule',
    },
    'stretch-dynamic-warmup-flow': {
      name: '10-Min dynamisches Mobility-Warm-up vor dem Training',
      description:
        'Aktiviert die Hüftrotation, die Fußhebung im Sprunggelenk und die Streckung der Brustwirbelsäule vor schweren Grundübungen.',
      targetArea: 'Ganzkörper-Aktivierung',
    },
    'stretch-desk-posture-reset': {
      name: 'Büro-Ausgleich: Nacken- & Handgelenk-Flow',
      description:
        'Wirkt langem Sitzen und Tastaturarbeit entgegen und löst Nacken, Brust, Handgelenke und Hüftbeuger.',
      targetArea: 'Nacken, Schultern & Hüfte',
    },
    'stretch-lumbar-glute-decompression': {
      name: 'Entlastung für unteren Rücken & Gesäß',
      description:
        'Entlastet die Lendenwirbelsäule nach Kniebeugen, Kreuzheben oder langen Reisetagen.',
      targetArea: 'Lendenwirbelsäule & Gesäß',
    },
    'stretch-full-body-evening-recovery': {
      name: 'Ganzkörper-Mobility & Entspannung am Abend',
      description:
        'Kompletter Cool-down von Kopf bis Fuß, der das Nervensystem herunterfährt und Regeneration sowie Schlafqualität verbessert.',
      targetArea: 'Ganzkörper-Regeneration',
    },
  },
  notes: {
    'tple-1': 'Arbeitssätze mit 1 RIR. 1 s Pause auf der Brust.',
    'tple-2': '30° Bankneigung, tiefe Dehnung unten.',
    'tple-3': 'Am Endpunkt 1 s anspannen.',
    'tple-4': 'Fokus auf die Dehnung des langen Kopfes.',
    'tple-5': 'Seil unten bei voller Streckung auseinanderziehen.',
    'tple-6': 'Aus dem vollen Hang bis Kinn über die Stange.',
    'tple-7': 'Oberkörperwinkel strikt halten.',
    'tple-8': 'Schulterblätter beim Absenken nach vorne, dann kräftig zurückziehen.',
    'tple-9': 'Ellbogen hinter dem Oberkörper halten.',
    'tple-10': 'Finisher für Brachialis & Unterarme.',
    'tple-11': 'Tiefe unter der Parallelen.',
    'tple-12': 'Hüfte nach hinten schieben, Dehnung im Beinbeuger spüren.',
    'tple-13': '1 s Pause oben.',
    'tple-14': 'Oberschenkelpolster fest fixieren.',
    'tple-15': '2 s Pause in der Dehnung unten.',
    'tple-16': 'Gesäß & Bauch anspannen.',
    'tple-17': 'In der Schulterblattebene, Ellbogen führen.',
    'tple-18': 'Außenrotation auf Stirnhöhe.',
    'tple-19': 'Becken nach hinten kippen.',
    'tple-ppl-1': 'Schwere Hauptdrückübung.',
    'tple-ppl-2': 'Kontrolliertes Drücken in der Schulterblattebene.',
    'tple-ppl-3': 'Dehnung der oberen Brust.',
    'tple-ppl-4': 'Supersatz mit Trizepsdrücken am Seil.',
    'tple-ppl-5': 'Ellbogen vollständig strecken.',
    'tple-ppl-6': 'Volle Dehnung unten.',
    'tple-ppl-7': 'Ellbogen hinter die Hüfte ziehen.',
    'tple-ppl-8': 'Schulterblätter 1 s zusammenziehen.',
    'tple-ppl-9': 'Außenrotation oben.',
    'tple-ppl-10': 'Ellbogen strikt fixieren.',
    'tple-ppl-11': 'Tiefe, kontrollierte Absenkphase.',
    'tple-ppl-12': 'Stange nah an den Schienbeinen halten.',
    'tple-ppl-13': 'Voller Bewegungsumfang für den Quadrizeps.',
    'tple-ppl-14': 'Hüfte ins Polster drücken.',
    'tple-ppl-15': '2 s Dehnung unten.',
    'tple-bro-1': 'Schwere Grundübung zum Einstieg.',
    'tple-bro-2': 'Fokus auf die obere Brust.',
    'tple-bro-3': 'Kontrollierte 3-s-Absenkphase.',
    'tple-bro-4': 'Finisher mit maximaler Kontraktion.',
    'tple-bro-5': 'Jede Wiederholung am Boden neu ansetzen.',
    'tple-bro-6': 'Breiter Obergriff.',
    'tple-bro-7': 'Zu den unteren Rippen rudern.',
    'tple-bro-8': 'Volle Lat-Dehnung oben.',
    'tple-bro-9': 'Rhomboiden 1 s anspannen.',
    'tple-bro-10': 'Striktes Schulterdrücken im Stand.',
    'tple-bro-11': 'Voller Bewegungsumfang.',
    'tple-bro-12': 'Ellbogen führen.',
    'tple-bro-13': 'Hintere Schulter & Rotatorenmanschette.',
    'tple-bro-14': 'Wirbelsäule einrollen.',
    'tple-bro-15': 'Quadrizeps vorermüden & Knie aufwärmen.',
    'tple-bro-16': 'Tiefer Bewegungsweg der Plattform.',
    'tple-bro-17': '1 s halten bei maximaler Beugung.',
    'tple-bro-18': 'Kontrollierte Absenkphase.',
    'tple-bro-19': 'Volle Streckung im Sprunggelenk.',
    'tple-bro-20': 'Supersatz mit Trizepsdrücken am Seil.',
    'tple-bro-21': 'Seil unten auseinanderziehen.',
    'tple-bro-22': 'Supersatz mit Trizepsstrecken über Kopf am Kabelzug.',
    'tple-bro-23': 'Tiefe Dehnung des langen Kopfes.',
    'tple-bro-24': 'Für kräftigen Brachialis & Unterarme.',
    'sre-1': '60 s links, 60 s rechts. Gesäß des hinteren Beins anspannen.',
    'sre-2': 'Fließende, kontrollierte Übergänge.',
    'sre-3': 'Becken gerade halten, aus der Hüftfalte vorbeugen.',
    'sre-4': 'Tief durch die Nase atmen.',
    'sre-5': '30 s gestrecktes Knie + 15 s gebeugtes Knie pro Seite.',
    'sre-6': 'Bei der Rotation ausatmen.',
    'sre-7': 'Kein Hohlkreuz machen.',
    'sre-8': 'Hände 30 s nach links, dann 30 s nach rechts.',
    'sre-9': 'Schulterblatt unten halten.',
    'sre-10': 'Bewegung an Ein- und Ausatmung anpassen.',
    'sre-11': '5–6 dynamische Ausfallschritte + BWS-Rotationen pro Seite.',
    'sre-12': 'Gewicht sanft über jedes Sprunggelenk verlagern.',
    'sre-13': 'Latissimus entspannen und tief in den Brustkorb atmen.',
    'sre-14': 'Sanft zur Seite neigen, andere Hand hinter dem Rücken fixieren.',
    'sre-15': 'Ellbogen im 90-Grad-Winkel am Türrahmen.',
    'sre-16': 'Finger zeigen zu den Knien, Hüfte nach hinten schaukeln.',
    'sre-17': 'Vom Sitzen verkürzte Hüftbeuger öffnen.',
    'sre-18': 'Langsam in den Bauch und unteren Rücken atmen.',
    'sre-19': '60 s pro Seite.',
    'sre-20': 'Aufrechte Wirbelsäule, Knie sanft nach unten drücken.',
    'sre-21': 'Gesäß auf die Fersen sinken lassen und Wirbelsäule verlängern.',
    'sre-22': 'Langsam 4 s einatmen, 6 s ausatmen.',
    'sre-23': 'Obere Schulter Richtung Boden sinken lassen.',
    'sre-24': 'Spannung an der äußeren Hüfte lösen.',
    'sre-25': 'Nacken und Schultern in der Vorbeuge entspannen.',
    'sre-26': '45 s pro Bein.',
    'sre-27': 'Mit ruhiger Nasenatmung abschließen.',
  },
};
