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
];
