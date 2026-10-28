import type { CatalogTranslation } from '../types';

/**
 * German translation of the built-in starter content, keyed by the id of its starter definition
 * (also stored as `systemKey` on user copies); notes by the id of the starter template/routine
 * exercise they belong to. German exercise text lives with the exercises (`overrides.ts`).
 */
export const de: CatalogTranslation = {
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
