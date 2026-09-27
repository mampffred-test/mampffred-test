import type { Recipe } from './model.ts';

export const additionalStandardRecipes: {
  pack: string;
  aliases: string[];
  recipe: Recipe;
}[] = [
  {
    pack: 'mampffred-pistazien-zitronen-spaghetti-v1',
    aliases: [
      'local:0d07594e-8b33-4e6a-8e95-b041805f461d',
      'imported:05c1b702bbcc4325d23cfe668f1e63330c06279786b7fdd8a9862a848c7bc1f0',
      'imported:f8cfe45fa3e76e240043c54e8da182d043b627d81e848e34dc1f8d0381dd8d9b',
    ],
    recipe: {
      id: 'standard-pistazien-zitronen-spaghetti-v1',
      shareId: 'sample-v1:pistazien-zitronen-spaghetti',
      name: 'Pistazien-Zitronen-Spaghetti',
      description:
        'Frische Zitrone, aromatische Kräuter und geröstete Pistazien treffen auf warme Spaghetti, saftige Cherrytomaten und zart schmelzenden Mozzarella.',
      minutes: 30,
      servings: 4,
      tags: ['Vegetarisch'],
      imageCell: 0,
      ingredients: [
        {
          amount: '500',
          unit: 'g',
          name: 'Spaghetti',
        },
        {
          amount: '100',
          unit: 'g',
          name: 'Pistazienkerne, geröstet und gesalzen',
        },
        {
          amount: '2',
          unit: 'Zehen',
          name: 'Knoblauch',
        },
        {
          amount: '100',
          unit: 'ml',
          name: 'Olivenöl',
        },
        {
          amount: '250',
          unit: 'g',
          name: 'Cherrytomaten',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Bio-Zitrone',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Geriebener Mozzarella',
        },
        {
          amount: '30',
          unit: 'g',
          name: '8-Kräuter-Mischung (TK), nach Belieben',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
      ],
      steps: [
        'Einen großen Topf mit Salzwasser zum Kochen bringen. Die Spaghetti darin nach Packungsangabe bissfest garen. Währenddessen die übrigen Zutaten vorbereiten.',
        'Olivenöl und TK-Kräuter in einer großen Schüssel verrühren. Die Bio-Zitrone heiß waschen und abtrocknen. Die gelbe Schale fein abreiben, die Zitrone auspressen und beides zum Kräuteröl geben.',
        'Den Knoblauch schälen, fein hacken oder pressen und unterrühren. Die Cherrytomaten waschen, halbieren oder vierteln und ebenfalls in die Schüssel geben. Mit Salz und Pfeffer abschmecken; die gesalzenen Pistazien bringen später zusätzliche Würze mit.',
        'Die Pistazienkerne grob hacken. Vor dem Abgießen etwa 150 ml (10 EL) Nudelwasser auffangen.',
        'Die heißen Spaghetti sofort zum Zitronen-Kräuter-Öl geben. Das aufgefangene Nudelwasser nach und nach unterheben, bis die Pasta gleichmäßig mit Sauce überzogen ist.',
        'Den Mozzarella portionsweise unter die warme Pasta heben, sodass er leicht anschmilzt. Noch einmal abschmecken, auf vier Teller verteilen und mit den gehackten Pistazien bestreuen. Direkt servieren.',
      ],
      imageKey: 'standard-pistazien-zitronen-spaghetti-image-v1',
    },
  },
  {
    pack: 'mampffred-rote-bete-feta-auflauf-v1',
    aliases: [
      'local:1d7f6c70-009a-4e8a-b3b7-0dd8d9a4d386',
      'imported:0a5b5bf69c2f9e9a8db061773ab1aca0158dffbddbda3af792d2278b39cb6756',
      'imported:975950c8d88a9765183374dab7f62234b9f2d833baf3e64bede07d067cddb421',
    ],
    recipe: {
      id: 'standard-rote-bete-feta-auflauf-v1',
      shareId: 'sample-v1:rote-bete-feta-auflauf',
      name: 'Rote-Bete-Feta-Auflauf mit Walnüssen',
      description:
        'Ofenwarme Rote Bete und würziger Feta in einem Petersilien-Dressing, verfeinert mit knackigen Walnüssen. Dazu gibt es knuspriges Ciabatta zum Auftunken.',
      minutes: 30,
      servings: 4,
      tags: ['Schnell', 'Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '500',
          unit: 'g',
          name: 'Rote Bete, vorgekocht und vakuumiert',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Feta',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
        },
        {
          amount: '20',
          unit: 'g',
          name: 'Petersilie (TK)',
        },
        {
          amount: '10',
          unit: 'Stück',
          name: 'Walnüsse (die Kerne verwenden)',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Ciabatta',
        },
        {
          amount: '1',
          unit: 'EL',
          name: 'Essig',
        },
        {
          amount: '5',
          unit: 'EL',
          name: 'Olivenöl',
        },
        {
          amount: '5',
          unit: 'EL',
          name: 'Wasser',
        },
        {
          amount: '',
          unit: '',
          name: 'Gewürze nach Wahl',
        },
      ],
      steps: [
        'Den Backofen auf 200 °C vorheizen. Die vorgekochte Rote Bete abtropfen lassen. Rote Bete und Feta in Scheiben schneiden und abwechselnd in eine Auflaufform schichten.',
        'Die Zwiebel schälen und fein würfeln. Mit Essig, Olivenöl, Wasser und TK-Petersilie verrühren. Mit Gewürzen nach Wahl abschmecken; der Feta bringt bereits Salz mit.',
        'Das Dressing gleichmäßig über Rote Bete und Feta verteilen. Den Auflauf auf mittlerer Schiene etwa 15–20 Minuten backen, bis alles heiß ist und der Feta an den Rändern leicht Farbe bekommt.',
        'Das Ciabatta nach Packungsangabe aufbacken. Falls Temperatur und Platz passen, kann es gegen Ende der Backzeit mit in den Ofen.',
        'Die Walnüsse bei Bedarf knacken und die Kerne grob zerbrechen. Den fertigen Auflauf damit bestreuen und mit dem warmen, in Scheiben geschnittenen Ciabatta servieren.',
      ],
      imageKey: 'standard-rote-bete-feta-auflauf-image-v1',
    },
  },
  {
    pack: 'mampffred-selbst-belegte-pizza-v1',
    aliases: [
      'local:e7f5b306-8b5b-4b6e-bcb8-f445557ba348',
      'imported:1544129f1405bc2a108fcaa41687f241b2eaabfecdbdb7cdc7b6a054124d03bf',
      'imported:ac51ff527c8834caa8c3c07381406299dd9212b3a53dad876577782d6ef5f276',
    ],
    recipe: {
      id: 'standard-selbst-belegte-pizza-v1',
      shareId: 'sample-v1:selbst-belegte-pizza',
      name: 'Blechpizza mit Feta, Ananas und Rucola',
      description:
        'Selbst belegt, bunt und großzügig: Zucchini, Cherrytomaten und süße Ananas auf knusprigem Pizzateig, dazu Feta, Mozzarella und frischer Rucola.',
      minutes: 35,
      servings: 4,
      tags: ['Vegetarisch'],
      imageCell: 3,
      ingredients: [
        {
          amount: '1',
          unit: 'Stück',
          name: 'Pizzateig für ein Blech',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Tomatensauce',
        },
        {
          amount: '1',
          unit: 'Dose',
          name: 'Ananas in Stücken',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Feta',
        },
        {
          amount: '250',
          unit: 'g',
          name: 'Cherrytomaten',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
        },
        {
          amount: '0,5',
          unit: 'Stück',
          name: 'Zucchini',
        },
        {
          amount: '250',
          unit: 'g',
          name: 'Geriebener Mozzarella',
        },
        {
          amount: '100',
          unit: 'g',
          name: 'Rucola',
        },
      ],
      steps: [
        'Den Backofen gemäß der Pizzateig-Packung vorheizen; als Richtwert gelten 200 °C. Den Teig auf einem mit Backpapier belegten Blech ausrollen oder ausbreiten.',
        'Die Ananas gut abtropfen lassen. Cherrytomaten und Zucchini waschen. Die Tomaten halbieren und die Zucchini in dünne Scheiben schneiden. Die Zwiebel schälen und in feine Streifen schneiden. Den Feta zerbröseln.',
        'Die Tomatensauce gleichmäßig auf dem Teig verstreichen und rundherum einen kleinen Rand frei lassen. Zucchini, Ananas, Cherrytomaten, Zwiebel und Feta darauf verteilen. Zum Schluss mit Mozzarella bestreuen.',
        'Die Pizza nach Packungsangabe etwa 15–20 Minuten backen, bis der Boden durchgebacken, der Rand goldbraun und der Käse geschmolzen ist. Bei einem anderen Teig haben dessen Temperatur- und Zeitangaben Vorrang.',
        'Währenddessen den Rucola waschen und gründlich trocken schütteln. Die fertige Pizza aus dem Ofen nehmen, mit dem frischen Rucola belegen und in Stücke schneiden.',
      ],
      imageKey: 'standard-selbst-belegte-pizza-image-v1',
    },
  },
  {
    pack: 'mampffred-gemueselasagne-v1',
    aliases: [
      'imported:755655e9120fc4cd2006936335c203154b8ecacc65515fa10d4497f004fe8587',
    ],
    recipe: {
      id: 'standard-gemueselasagne-v1',
      shareId: 'sample-v1:gemueselasagne',
      name: 'Gemüselasagne',
      description:
        'Gemüse, cremige Tomatensoße und geschmolzener Käse werden in der Auflaufform zu einer herzhaften Lasagne geschichtet.',
      servings: 4,
      minutes: 50,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '250',
          unit: 'g',
          name: 'Lasagneplatten',
        },
        {
          amount: '2',
          unit: 'Dosen',
          name: 'gehackte Tomaten',
        },
        {
          amount: '200',
          unit: 'ml',
          name: 'Soja-Cuisine',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zucchini',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Optional: Möhren',
        },
        {
          amount: '150',
          unit: 'g',
          name: 'Optional: Mais',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'geriebener Mozzarella oder Edamer',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Knoblauchzehen',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl zum Einfetten und Anbraten',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
      ],
      steps: [
        'Backofen auf 200 °C Ober-/Unterhitze vorheizen. Auflaufform einölen oder einfetten und den Boden mit Lasagneplatten auslegen.',
        'Zwiebel schneiden und in einem Topf mit etwas Öl anbraten. Gehackte Tomaten, Salz, Pfeffer, gepressten Knoblauch und Soja-Cuisine dazugeben. Aufkochen lassen und abschmecken.',
        'Zucchini und Paprika würfeln. Möhren (falls verwendet) ebenfalls würfeln; Mais abtropfen lassen.',
        'Gemüse als erste Schicht in die Form geben, etwas geriebenen Käse darüberstreuen und mit Lasagneplatten bedecken. Soße darübergeben, bis die Platten bedeckt sind.',
        'Schichten wiederholen, bis die Zutaten aufgebraucht sind. Die oberste Schicht großzügig mit Käse bedecken.',
        'Etwa 35 Minuten backen, bis die Lasagneplatten gar sind und der Käse eine Kruste gebildet hat.',
      ],
      imageKey: 'standard-gemueselasagne-image-v1',
    },
  },
  {
    pack: 'mampffred-couscous-salat-mit-gebratenem-gemuese-und-raeuchertofu-v1',
    aliases: [
      'imported:8c18793379363cc14a40c9c6134dd6a693b7ba466244c565ab12cdef8fa8759d',
    ],
    recipe: {
      id: 'standard-couscous-salat-mit-gebratenem-gemuese-und-raeuchertofu-v1',
      shareId:
        'sample-v1:couscous-salat-mit-gebratenem-gemuese-und-raeuchertofu',
      name: 'Couscous-Salat mit gebratenem Gemüse und Räuchertofu',
      description:
        'Würziger Couscous wird mit frischem Salat und gebratenem Gemüse kombiniert und mit Räuchertofu oder Halloumi ergänzt.',
      servings: 4,
      minutes: 25,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '200',
          unit: 'ml',
          name: 'Couscous (1 Glas)',
        },
        {
          amount: '400',
          unit: 'ml',
          name: 'Wasser (2 Gläser à 200 ml)',
        },
        {
          amount: '1,5',
          unit: 'TL',
          name: 'Gemüsebrühe',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zucchini',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Salatherz',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Räuchertofu',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Halloumi optional: als Ersatz für den Räuchertofu oder zusätzlich',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl zum Anbraten',
        },
        {
          amount: '',
          unit: '',
          name: 'Leinöl oder Olivenöl zum Darübergeben',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
      ],
      steps: [
        'Couscous in einem Sieb waschen. Wasser im Topf oder Wasserkocher erhitzen, in einen Topf geben und die Gemüsebrühe darin auflösen.',
        'Couscous dazugeben, den Topf abdecken und quellen lassen. Gelegentlich umrühren; falls der Couscous zu trocken wird, etwas Wasser nachgießen.',
        'Paprika, Zucchini, Zwiebel und Räuchertofu (oder Halloumi) schneiden und in einer Pfanne mit etwas Öl anbraten.',
        'Salatherzblätter waschen und klein schneiden. Couscous als Basis auf Teller verteilen, Salat daraufgeben und das gebratene Gemüse mit Tofu beziehungsweise Halloumi darauf anrichten.',
        'Mit Salz und Pfeffer würzen und zum Schluss Leinöl oder Olivenöl darüberträufeln.',
      ],
      imageKey:
        'standard-couscous-salat-mit-gebratenem-gemuese-und-raeuchertofu-image-v1',
    },
  },
  {
    pack: 'mampffred-ofen-risotto-mit-brechbohnen-v1',
    aliases: [
      'imported:306f58e0e164ef3207c79a83dfdea2790f1e3b7fafd4c92eb48b4092c11ef47c',
    ],
    recipe: {
      id: 'standard-ofen-risotto-mit-brechbohnen-v1',
      shareId: 'sample-v1:ofen-risotto-mit-brechbohnen',
      name: 'Ofen-Risotto mit Brechbohnen',
      description:
        'Im Ofen gegarter Risottoreis mit Brechbohnen, Paprika und geschmolzenem Käse.',
      servings: 4,
      minutes: 45,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '300',
          unit: 'g',
          name: 'Risottoreis',
        },
        {
          amount: '800',
          unit: 'ml',
          name: 'Gemüsebrühe, zusätzlich heiße Brühe nach Bedarf',
        },
        {
          amount: '300',
          unit: 'g',
          name: 'Brechbohnen, tiefgekühlt',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Optional: Brokkoli',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Optional: Knoblauchzehe',
        },
        {
          amount: '1',
          unit: 'EL',
          name: 'Öl',
        },
        {
          amount: '50',
          unit: 'g',
          name: 'geriebener Käse',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
      ],
      steps: [
        'Backofen auf 200 °C Ober-/Unterhitze vorheizen. Zwiebel und Paprika würfeln; Knoblauch bei Verwendung fein hacken.',
        'Auflaufform einölen. Risottoreis, Zwiebel, Paprika und optional Knoblauch hineingeben. Heiße Gemüsebrühe angießen, bis der Reis bedeckt ist.',
        'Offen im Ofen garen. Nach etwa 20 Minuten tiefgekühlte Brechbohnen und optional Brokkoli dazugeben und umrühren.',
        'Weitergaren und etwa alle 10 Minuten umrühren. Bei Bedarf heiße Gemüsebrühe nachgießen, damit der Reis nicht austrocknet. Garen, bis der Reis bissfest und das Gemüse gar ist.',
        'Geriebenen Käse unterrühren, mit Salz und Pfeffer abschmecken und servieren.',
      ],
      imageKey: 'standard-ofen-risotto-mit-brechbohnen-image-v1',
    },
  },
  {
    pack: 'mampffred-feta-pasta-aus-dem-ofen-v1',
    aliases: [
      'imported:eb38cab6a56fae01dc449948445bee34fc908b7f427d0de68a8176409bdd9bea',
    ],
    recipe: {
      id: 'standard-feta-pasta-aus-dem-ofen-v1',
      shareId: 'sample-v1:feta-pasta-aus-dem-ofen',
      name: 'Feta-Pasta aus dem Ofen',
      description:
        'Im Ofen gebackener Feta und Cherrytomaten werden mit gekochten Nudeln zu einer cremigen Pasta vermischt.',
      servings: 4,
      minutes: 40,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '500',
          unit: 'g',
          name: 'Nudeln (Spaghetti, Locken, Spirelli oder eine andere Form)',
          scaleWithServings: true,
        },
        {
          amount: '500',
          unit: 'g',
          name: 'Cherrytomaten',
          scaleWithServings: false,
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Feta',
          scaleWithServings: false,
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
          scaleWithServings: false,
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Knoblauchzehen',
          scaleWithServings: false,
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Öl',
          scaleWithServings: false,
        },
        {
          amount: '',
          unit: '',
          name: 'Salz, Pfeffer und weitere Gewürze nach Wahl',
          scaleWithServings: false,
        },
      ],
      steps: [
        'Backofen auf 200 °C Ober-/Unterhitze vorheizen und eine Auflaufform einfetten oder einölen. Feta im Ganzen in die Mitte legen und einölen. Cherrytomaten waschen und rund um den Feta verteilen.',
        'Zwiebel hacken und Knoblauch pressen oder hacken. Beides in die Form geben. Mit Salz, Pfeffer und weiteren Gewürzen nach Wunsch würzen und mit Öl beträufeln oder besprühen.',
        'Auflaufform 30 Minuten backen. Nach 10 Minuten einen großen Topf Wasser zum Kochen bringen und die Nudeln nach Packungsangabe kochen.',
        'Form vorsichtig aus dem Ofen nehmen. Die heißen Tomaten mit einem spitzen Messer mehrfach anstechen, damit beim Zerdrücken weniger Flüssigkeit spritzt.',
        'Cherrytomaten mit einer Gabel zerdrücken, Feta zerdrücken und beides zu einer cremigen Soße verrühren.',
        'Nudeln dazugeben und gründlich vermischen, bis sie rundum mit der Soße bedeckt sind. Servieren.',
      ],
      imageKey: 'standard-feta-pasta-aus-dem-ofen-image-v1',
    },
  },
  {
    pack: 'mampffred-halloumi-wraps-v1',
    aliases: [
      'imported:e94a14875c3f8b7f6ad0fe4048a7127ea8c75af42d917a881476b79411dec3fa',
    ],
    recipe: {
      id: 'standard-halloumi-wraps-v1',
      shareId: 'sample-v1:halloumi-wraps',
      name: 'Halloumi-Wraps',
      description:
        'Gebratener Halloumi mit knackigem Gemüse und Dressing, eingerollt in einen Wrap.',
      servings: 2,
      minutes: 20,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '2',
          unit: 'Stück',
          name: 'große Wraps',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Halloumi',
        },
        {
          amount: '0,5',
          unit: 'Stück',
          name: 'Gurke',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'kleine Zwiebel',
        },
        {
          amount: '1',
          unit: 'Handvoll',
          name: 'Salat',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Dressing nach Wahl (gekauft oder selbst gemachtes Joghurt-Zitronen-Dressing) (Menge ca.)',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl zum Braten',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz, Pfeffer und Gewürze nach Wahl',
        },
      ],
      steps: [
        'Halloumi und Zwiebel schneiden und zusammen in etwas Öl anbraten. Gurke und Paprika schneiden. Salat waschen.',
        'Einen Wrap flach auf einen Teller legen und mit Dressing bestreichen. Salat in der oberen Hälfte beziehungsweise mittig verteilen.',
        'Halloumi, Paprika, Gurke und Zwiebeln daraufgeben und würzen.',
        'Den Wrap von unten so weit wie möglich nach oben klappen, dann die linke und rechte Seite einschlagen. Nicht extra erwärmen.',
      ],
      imageKey: 'standard-halloumi-wraps-image-v1',
    },
  },
  {
    pack: 'mampffred-halloumi-burger-v1',
    aliases: [
      'imported:1b540e5a790c871cb7895ce5c76fa70312f5bbfe357f698516d9cf0812ec7ab5',
    ],
    recipe: {
      id: 'standard-halloumi-burger-v1',
      shareId: 'sample-v1:halloumi-burger',
      name: 'Halloumi-Burger',
      description:
        'Halloumi, gebratene Zwiebeln, Tomate und Salat im Burger-Bun mit Sauce nach Wahl.',
      servings: 2,
      minutes: 25,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '4',
          unit: 'Stück',
          name: 'Burger-Buns',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Halloumi',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Fleischtomate',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zwiebel',
        },
        {
          amount: '',
          unit: '',
          name: 'Salatblätter (Herzsalat)',
        },
        {
          amount: '',
          unit: '',
          name: 'Burgersauce nach Wahl',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
        {
          amount: '',
          unit: '',
          name: 'Optional: etwas Zucker zum Karamellisieren der Zwiebeln',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl zum Braten',
        },
      ],
      steps: [
        'Halloumi in Scheiben schneiden. Zwiebel in Ringe oder Streifen schneiden. Tomate waschen und in Scheiben schneiden; Salatblätter waschen.',
        'Halloumi und Zwiebel zusammen in einer Pfanne anbraten. Zwiebeln bei Bedarf mit etwas Zucker karamellisieren. Mit Salz und Pfeffer würzen.',
        'Buns kurz anrösten. Untere Bunhälften mit Burgersauce bestreichen, Salat, Tomate sowie Halloumi und Zwiebeln daraufgeben. Mit den oberen Bunhälften schließen.',
      ],
      imageKey: 'standard-halloumi-burger-image-v1',
    },
  },
  {
    pack: 'mampffred-sommerrollen-mit-raeuchertofu-v1',
    aliases: [
      'imported:db7ae24ece4941b5c828ebc04ca13d95e6a043dd86c46f799ca5106bb3a688b3',
    ],
    recipe: {
      id: 'standard-sommerrollen-mit-raeuchertofu-v1',
      shareId: 'sample-v1:sommerrollen-mit-raeuchertofu',
      name: 'Sommerrollen mit Räuchertofu',
      description:
        'Frische Sommerrollen mit gebratenem Räuchertofu und cremiger Erdnuss-Sojasauce.',
      servings: 2,
      minutes: 25,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '8',
          unit: 'Stück',
          name: 'Reispapierblätter',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Räuchertofu',
        },
        {
          amount: '0,5',
          unit: 'Stück',
          name: 'Gurke',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Frühlingszwiebeln',
        },
        {
          amount: '',
          unit: '',
          name: 'Koriander nach Geschmack',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl zum Braten',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Sojasauce (für die Erdnuss-Sojasauce)',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Erdnussmus (für die Erdnuss-Sojasauce)',
        },
        {
          amount: '0,5',
          unit: 'Stück',
          name: 'Zitrone, Saft (für die Erdnuss-Sojasauce)',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Knoblauchzehe (für die Erdnuss-Sojasauce)',
        },
        {
          amount: '',
          unit: '',
          name: 'Wasser nach Bedarf zum Verdünnen (für die Erdnuss-Sojasauce)',
        },
      ],
      steps: [
        'Räuchertofu in Streifen schneiden und in etwas Öl anbraten. Gurke, Paprika und Frühlingszwiebeln in dünne Streifen schneiden; Koriander vorbereiten.',
        'Sojasauce, Erdnussmus, Zitronensaft und gepressten oder fein gehackten Knoblauch verrühren. Schluckweise Wasser zugeben, bis die Sauce die gewünschte Konsistenz hat.',
        'Reispapierblätter einzeln kurz in Wasser einweichen. Mit Gemüse, Tofu und Koriander belegen, Seiten einschlagen und fest aufrollen.',
        'Mit der Sauce servieren.',
      ],
      imageKey: 'standard-sommerrollen-mit-raeuchertofu-image-v1',
    },
  },
  {
    pack: 'mampffred-mildes-gemuesecurry-mit-reis-v1',
    aliases: [
      'imported:fc1ea24428b79815a5e4a3511c280c4fa29d203f3df85d690ded06c32bf8366a',
    ],
    recipe: {
      id: 'standard-mildes-gemuesecurry-mit-reis-v1',
      shareId: 'sample-v1:mildes-gemuesecurry-mit-reis',
      name: 'Mildes Gemüsecurry mit Reis',
      description:
        'Mildes Kokos-Gemüsecurry mit Zucchini, Brokkoli und Zuckerschoten, serviert mit Reis.',
      servings: 2,
      minutes: 25,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '150',
          unit: 'g',
          name: 'Reis',
        },
        {
          amount: '400',
          unit: 'ml',
          name: 'Kokosmilch',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zucchini',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Brokkoli',
        },
        {
          amount: '150',
          unit: 'g',
          name: 'Zuckerschoten',
        },
        {
          amount: '1–2',
          unit: 'EL',
          name: 'milde Currypaste',
        },
        {
          amount: '1',
          unit: 'EL',
          name: 'Öl',
        },
      ],
      steps: [
        'Reis nach Packungsangabe kochen. Zucchini schneiden, Brokkoli in Röschen teilen und Zuckerschoten waschen.',
        'Öl in einem Topf oder einer tiefen Pfanne erhitzen und Currypaste kurz darin anbraten.',
        'Gemüse und Kokosmilch dazugeben. Köcheln lassen, bis das Gemüse gar, aber noch bissfest ist.',
        'Curry mit Reis servieren.',
      ],
      imageKey: 'standard-mildes-gemuesecurry-mit-reis-image-v1',
    },
  },
  {
    pack: 'mampffred-gnocchi-auflauf-mit-gruenem-spargel-tomaten-und-feta-v1',
    aliases: [
      'imported:e052c0ef71c8bc2d53e07bba5c1fb2002e8a993f57a8c292481f0a5387f5d0b2',
    ],
    recipe: {
      id: 'standard-gnocchi-auflauf-mit-gruenem-spargel-tomaten-und-feta-v1',
      shareId: 'sample-v1:gnocchi-auflauf-mit-gruenem-spargel-tomaten-und-feta',
      name: 'Gnocchi-Auflauf mit grünem Spargel, Tomaten und Feta',
      description:
        'Gnocchi und grüner Spargel werden mit Tomaten, Feta und Kräutern im Ofen gebacken.',
      servings: 2,
      minutes: 35,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '400',
          unit: 'g',
          name: 'Gnocchi (ungekocht, aus dem Kühlregal)',
        },
        {
          amount: '300',
          unit: 'g',
          name: 'grüner Spargel',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Cherrytomaten',
        },
        {
          amount: '30',
          unit: 'g',
          name: 'getrocknete Tomaten',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Feta (eine Packung)',
        },
        {
          amount: '3',
          unit: 'EL',
          name: 'Olivenöl',
        },
        {
          amount: '100',
          unit: 'ml',
          name: 'Gemüsebrühe',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Knoblauchzehen',
        },
        {
          amount: '1',
          unit: 'TL',
          name: 'getrocknete italienische Kräuter',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
        {
          amount: '2–3',
          unit: 'EL',
          name: 'Optional: grünes Pesto',
        },
      ],
      steps: [
        'Backofen auf 200 °C Ober-/Unterhitze (oder 180 °C Umluft) vorheizen. Holzige Enden vom Spargel abschneiden und Stangen in 3–4 cm lange Stücke schneiden. Cherrytomaten waschen und nach Wunsch halbieren; getrocknete Tomaten und Knoblauch klein schneiden.',
        'Ungekochte Gnocchi, Spargel, beide Tomatensorten, Knoblauch, Olivenöl, Gemüsebrühe, Kräuter, Salz und Pfeffer in eine Auflaufform geben und gründlich vermengen. Pesto optional ebenfalls unterrühren.',
        'Feta darüber zerbröseln oder als ganzen Block in die Mitte legen.',
        '20–25 Minuten backen, bis die Gnocchi gar und der Spargel bissfest ist.',
        'Alles gemeinsam zu einer cremigen Masse vermischen und servieren.',
      ],
      imageKey:
        'standard-gnocchi-auflauf-mit-gruenem-spargel-tomaten-und-feta-image-v1',
    },
  },
  {
    pack: 'mampffred-ofengemuese-mit-raeuchertofu-feta-und-quark-v1',
    aliases: [
      'imported:ec3dda8027ffc81526d15b833be667c9af896990e4d1cc41aa5cd4de21a695d9',
    ],
    recipe: {
      id: 'standard-ofengemuese-mit-raeuchertofu-feta-und-quark-v1',
      shareId: 'sample-v1:ofengemuese-mit-raeuchertofu-feta-und-quark',
      name: 'Ofengemüse mit Räuchertofu, Feta und Quark',
      description:
        'Buntes Ofengemüse mit Räuchertofu und Feta, serviert mit Quark.',
      servings: 4,
      minutes: 40,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '300',
          unit: 'g',
          name: 'Drillinge oder 300 g Süßkartoffel',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Möhren',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zucchini',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'kleiner Brokkoli',
        },
        {
          amount: '250',
          unit: 'g',
          name: 'Rote Bete, vorgekocht',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Räuchertofu',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Feta',
        },
        {
          amount: '500',
          unit: 'g',
          name: 'Quark',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Öl',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz, Pfeffer und Kräuter nach Wahl',
        },
      ],
      steps: [
        'Backofen auf 200 °C Ober-/Unterhitze vorheizen. Drillinge beziehungsweise Süßkartoffel, Paprika, Möhren und Zucchini schneiden. Brokkoli in Röschen teilen. Vorgekochte Rote Bete und Räuchertofu würfeln.',
        'Gemüse und Tofu mit Öl und Gewürzen vermengen und auf einem Blech verteilen. Rote Bete und Feta von Anfang an mit auf das Blech geben.',
        'Etwa 30–35 Minuten backen, bis die Kartoffeln gar sind und das Gemüse weich ist.',
        'Mit Quark servieren.',
      ],
      imageKey: 'standard-ofengemuese-mit-raeuchertofu-feta-und-quark-image-v1',
    },
  },
  {
    pack: 'mampffred-toast-hawaii-v1',
    aliases: [
      'imported:0e0140c2f2a2e4673566eaa4e8261d88566517796e03df3b257aa0c99989af07',
    ],
    recipe: {
      id: 'standard-toast-hawaii-v1',
      shareId: 'sample-v1:toast-hawaii',
      name: 'Toast Hawaii',
      description: 'Toast mit Tomate, Ananas und überbackenem Käse.',
      servings: 2,
      minutes: 20,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '4',
          unit: 'Scheiben',
          name: 'Toastbrot',
        },
        {
          amount: '4',
          unit: 'Stück',
          name: 'Ananasscheiben',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Tomate',
        },
        {
          amount: '4',
          unit: 'Stück',
          name: 'Käsescheiben',
        },
      ],
      steps: [
        'Toastscheiben mit Tomatenscheiben, Ananas und Käse belegen.',
        'Im Backofen überbacken, bis der Käse geschmolzen ist. Das Toastbrot muss vorher nicht separat getoastet werden.',
      ],
      imageKey: 'standard-toast-hawaii-image-v1',
    },
  },
  {
    pack: 'mampffred-sandwichmaker-sandwiches-v1',
    aliases: [
      'imported:c98bdb1fd57f859952884e235af15e30dcb3635251067612488b72147df74f4e',
    ],
    recipe: {
      id: 'standard-sandwichmaker-sandwiches-v1',
      shareId: 'sample-v1:sandwichmaker-sandwiches',
      name: 'Sandwichmaker-Sandwiches',
      description:
        'Goldbraune Toast-Sandwiches mit Tomate und Käse aus dem Sandwichmaker, dazu ein Dip.',
      servings: 2,
      minutes: 20,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '8',
          unit: 'Stück',
          name: 'Toastscheiben (für 4 Sandwiches)',
        },
        {
          amount: '',
          unit: '',
          name: 'Butter zum Bestreichen',
        },
        {
          amount: '',
          unit: '',
          name: 'Tomaten, in Scheiben',
        },
        {
          amount: '4',
          unit: 'Stück',
          name: 'Käsescheiben (eine pro Sandwich)',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl oder Fett für den Sandwichmaker, falls kein Backpapier verwendet wird',
        },
        {
          amount: '',
          unit: '',
          name: 'Dip nach Wahl zum Servieren',
        },
      ],
      steps: [
        'Sandwichmaker einfetten oder einölen; alternativ Backpapier zwischen Sandwichmaker und Toast legen.',
        'Toastscheiben mit Butter bestreichen. Vier Scheiben mit Tomatenscheiben und je einer Käsescheibe belegen und mit den übrigen Toastscheiben abdecken.',
        'Im Sandwichmaker goldbraun toasten. Auf einem Brett halbieren und mit Dip zum Eintunken servieren.',
      ],
      imageKey: 'standard-sandwichmaker-sandwiches-image-v1',
    },
  },
  {
    pack: 'mampffred-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-v1',
    aliases: [
      'imported:33a2eac0ccd070dc910c9ffcc9e1376a81afa0fba49e08b4e898a250e6d95c00',
    ],
    recipe: {
      id: 'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-v1',
      shareId:
        'sample-v1:vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen',
      name: 'Vegetarisches Hühnerfrikassee mit Kräuterseitlingen',
      description:
        'Kräuterseitlinge, Gemüse, Erbsen und Spargel in cremiger Cuisine-Sauce, dazu Naturreis.',
      servings: 4,
      minutes: 35,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '8',
          unit: 'Stück',
          name: 'Kräuterseitlinge',
        },
        {
          amount: '4',
          unit: 'Stück',
          name: 'mittelgroße Möhren',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Zwiebeln',
        },
        {
          amount: '300',
          unit: 'g',
          name: 'Erbsen, tiefgekühlt',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Kohlrabi',
        },
        {
          amount: '400',
          unit: 'g',
          name: 'weißer Spargel aus dem Glas',
        },
        {
          amount: '300',
          unit: 'ml',
          name: 'Hafer-Cuisine oder Soja-Cuisine',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Mehl',
        },
        {
          amount: '2',
          unit: 'TL',
          name: 'Gemüsebrühe beziehungsweise Gemüsebrühepulver',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Naturreis',
        },
        {
          amount: '',
          unit: '',
          name: 'Öl zum Anbraten',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
        {
          amount: '',
          unit: '',
          name: 'Optional: etwas Spargelwasser zum Verdünnen',
        },
      ],
      steps: [
        'Naturreis nach Packungsangabe kochen. Einen großen Kochtopf für das Frikassee verwenden.',
        'Kräuterseitlinge vorbereiten: Stiele in Streifen zupfen, Hüte würfeln. Möhren, Kohlrabi und Zwiebeln würfeln. Spargel abtropfen lassen und in Stücke schneiden.',
        'Zwiebeln, Möhren und Kohlrabi in etwas Öl anbraten. Kräuterseitlinge dazugeben und mitbraten.',
        'Mehl gleichmäßig über das Gemüse und die Pilze streuen. Sofort gründlich umrühren, damit das Mehl sich verteilt und keine Klümpchen bildet. 1–2 Minuten unter Rühren anschwitzen.',
        'Hafer- oder Soja-Cuisine nach und nach zugießen und dabei ständig rühren, bis eine glatte Sauce entsteht. Gemüsebrühe einrühren und einige Minuten köcheln lassen. Ist die Sauce zu dick, etwas Spargelwasser ergänzen.',
        'Erbsen und Spargelstücke zugeben und kurz mitköcheln lassen. Mit Salz und Pfeffer abschmecken.',
        'Mit Naturreis servieren.',
      ],
      imageKey:
        'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-image-v2',
    },
  },
  {
    pack: 'mampffred-kuerbissuppe-mit-raeuchertofu-v1',
    aliases: [
      'imported:97a45d5073a8298b0a36066b98108313645f6cc8f8f2a53fc319b047a0e6abb5',
    ],
    recipe: {
      id: 'standard-kuerbissuppe-mit-raeuchertofu-v1',
      shareId: 'sample-v1:kuerbissuppe-mit-raeuchertofu',
      name: 'Kürbissuppe mit Räuchertofu',
      description:
        'Cremige Hokkaido-Kürbissuppe mit Süßkartoffel, Ingwer und Kokosmilch, mit gebratenem Räuchertofu und Baguette serviert.',
      servings: 4,
      minutes: 40,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '1',
          unit: 'Stück',
          name: 'mittelgroßer Hokkaido-Kürbis (ca. 1 kg)',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Süßkartoffel',
        },
        {
          amount: '2',
          unit: 'Stück',
          name: 'Möhren',
        },
        {
          amount: '20',
          unit: 'g',
          name: 'Ingwer (Menge ca.)',
        },
        {
          amount: '800',
          unit: 'ml',
          name: 'Gemüsebrühe',
        },
        {
          amount: '400',
          unit: 'ml',
          name: 'Kokosmilch',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Räuchertofu',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Baguette',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
      ],
      steps: [
        'Einen großen Kochtopf verwenden. Kürbis waschen, entkernen und würfeln. Süßkartoffel und Möhren schälen und würfeln. Ingwer reiben oder fein hacken.',
        'Etwas Öl im Topf erhitzen und Kürbis, Süßkartoffel, Möhren und Ingwer kurz anbraten.',
        'Gemüsebrühe dazugeben und köcheln lassen, bis das Gemüse weich ist.',
        'Kokosmilch zugießen und die Suppe fein pürieren. Mit Salz und Pfeffer abschmecken.',
        'Räuchertofu würfeln und separat in einer Pfanne anbraten. Suppe mit Räuchertofu als Topping und Baguette servieren.',
      ],
      imageKey: 'standard-kuerbissuppe-mit-raeuchertofu-image-v1',
    },
  },
  {
    pack: 'mampffred-zucchini-feta-roellchen-mit-cherrytomaten-v1',
    aliases: [
      'imported:6ff43e89cec4f7ef267b528e3d2922eee48fb885e98797f1e2f2823e2f1feedf',
    ],
    recipe: {
      id: 'standard-zucchini-feta-roellchen-mit-cherrytomaten-v1',
      shareId: 'sample-v1:zucchini-feta-roellchen-mit-cherrytomaten',
      name: 'Zucchini-Feta-Röllchen mit Cherrytomaten',
      description:
        'Mit Feta gefüllte Zucchiniröllchen werden abwechselnd mit Cherrytomaten auf Spießen gebacken.',
      servings: 2,
      minutes: 25,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '1',
          unit: 'Stück',
          name: 'Zucchini',
        },
        {
          amount: '100',
          unit: 'g',
          name: 'Feta',
        },
        {
          amount: '8',
          unit: 'Stück',
          name: 'Cherrytomaten',
        },
        {
          amount: '4',
          unit: 'Stück',
          name: 'Schaschlikspieße',
        },
        {
          amount: '1',
          unit: 'EL',
          name: 'Öl',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz, Pfeffer und Paprikapulver',
        },
      ],
      steps: [
        'Backofen auf 180 °C Ober-/Unterhitze vorheizen. Zucchini waschen und längs in dünne Streifen schneiden. Zucchinistreifen vor dem Einrollen mit Salz, Pfeffer und Paprikapulver würzen.',
        'Feta in kleine Stücke schneiden. Jeweils ein Stück Feta in einen Zucchinistreifen einrollen.',
        'Röllchen und Cherrytomaten abwechselnd auf die Schaschlikspieße stecken, sodass zwischen den Röllchen jeweils eine Tomate sitzt. In eine Auflaufform legen.',
        'Mit Öl beträufeln und 10–15 Minuten backen. Heiß servieren.',
      ],
      imageKey: 'standard-zucchini-feta-roellchen-mit-cherrytomaten-image-v1',
    },
  },
  {
    pack: 'mampffred-gemuesesuppe-mit-brokkoli-v1',
    aliases: [
      'imported:9b8a365877f76e825000097497a39e57de3462362137362e0cf10907e5e0ba53',
    ],
    recipe: {
      id: 'standard-gemuesesuppe-mit-brokkoli-v1',
      shareId: 'sample-v1:gemuesesuppe-mit-brokkoli',
      name: 'Gemüsesuppe mit Brokkoli',
      description:
        'Herzhafte Gemüsesuppe mit Brokkoli und wahlweise Kartoffeln oder Muschelnudeln.',
      servings: 4,
      minutes: 30,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '1',
          unit: 'Bund',
          name: 'Suppengemüse (ca. 500 g)',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Brokkoli (ca. 300 g)',
        },
        {
          amount: '300',
          unit: 'g',
          name: 'Kartoffeln (alternativ je 300 g Kartoffeln: 100 g Muschelnudeln)',
        },
        {
          amount: '1,5',
          unit: 'l',
          name: 'Gemüsebrühe; nach Bedarf so viel, dass das Gemüse bedeckt ist (Menge ca.)',
        },
        {
          amount: '1',
          unit: 'EL',
          name: 'Öl',
        },
        {
          amount: '',
          unit: '',
          name: 'Ingwer und/oder Kurkuma nach Geschmack',
        },
        {
          amount: '',
          unit: '',
          name: 'Kümmel, Salz und Pfeffer nach Geschmack',
        },
      ],
      steps: [
        'Suppengemüse waschen und in mittelgroße, mundgerechte Stücke schneiden. Brokkoli in Röschen teilen. Tipp: Müssen kleine Röschen weiter geteilt werden, den Stielansatz unten einschneiden und das Röschen mit beiden Händen auseinanderziehen. So krümelt der Brokkoli weniger.',
        'Für die Kartoffelvariante die Kartoffeln würfeln. Ingwer und/oder Kurkuma reiben.',
        'Öl in einem Topf erhitzen. Suppengemüse und Ingwer beziehungsweise Kurkuma darin scharf anbraten. Gemüsebrühe angießen, bis alles bedeckt ist, und aufkochen lassen.',
        'Kartoffelvariante: Kartoffelwürfel dazugeben und köcheln lassen, bis sie fast gar sind. Nudelvariante: Muschelnudeln nach dem Aufkochen dazugeben und nach Packungsangabe garen.',
        'Brokkoli gegen Ende dazugeben und etwa 8–10 Minuten mitköcheln lassen, bis er gar, aber noch bissfest ist.',
        'Nach Geschmack mit zusätzlicher Gemüsebrühe oder Salz, Pfeffer und Kümmel würzen. Servieren.',
      ],
      imageKey: 'standard-gemuesesuppe-mit-brokkoli-image-v1',
    },
  },
  {
    pack: 'mampffred-salat-mit-raeuchertofu-oder-halloumi-v1',
    aliases: [
      'imported:dba7c6687caf19280c1330345bb6dfb1a33ac2df1ca88ff3b83588c9a8e9e0e9',
    ],
    recipe: {
      id: 'standard-salat-mit-raeuchertofu-oder-halloumi-v1',
      shareId: 'sample-v1:salat-mit-raeuchertofu-oder-halloumi',
      name: 'Salat mit Räuchertofu oder Halloumi',
      description:
        'Frischer Salat mit knackigem Gemüse, Apfel und gebratenem Räuchertofu oder Halloumi.',
      servings: 4,
      minutes: 20,
      tags: ['Vegetarisch'],
      imageCell: 4,
      ingredients: [
        {
          amount: '1',
          unit: 'Stück',
          name: 'Salatherz',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Paprika',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Apfel',
        },
        {
          amount: '1',
          unit: 'Stück',
          name: 'Gurke',
        },
        {
          amount: '200',
          unit: 'g',
          name: 'Räuchertofu oder alternativ 200 g Halloumi',
        },
        {
          amount: '',
          unit: '',
          name: 'Etwas Öl zum Anbraten',
        },
        {
          amount: '1',
          unit: 'EL',
          name: 'Senf',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'heller Balsamico',
        },
        {
          amount: '2',
          unit: 'EL',
          name: 'Wasser',
        },
        {
          amount: '',
          unit: '',
          name: 'Salz und Pfeffer',
        },
      ],
      steps: [
        'Salatherz waschen, trocknen und zerteilen. Paprika, Apfel und Gurke waschen und klein schneiden.',
        'Räuchertofu oder Halloumi würfeln und in etwas Öl anbraten.',
        'Senf, hellen Balsamico und Wasser verrühren. Mit Salz und Pfeffer abschmecken.',
        'Salat und geschnittenes Gemüse anrichten. Tofu oder Halloumi daraufgeben und das Dressing kurz vor dem Servieren darüber verteilen.',
      ],
      imageKey: 'standard-salat-mit-raeuchertofu-oder-halloumi-image-v1',
    },
  },
];
