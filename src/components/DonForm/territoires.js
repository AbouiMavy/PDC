// Listes facultatives par pays. Sources de référence : ISO 3166-2 (pycountry),
// liste camerounaise des 58 départements, référentiel territorial français.
// Ce composant peut proposer une saisie libre lorsque le territoire n’est pas répertorié.
export const TERRITOIRES = {
  "CM": {
    "regionLabel": "Région",
    "departementLabel": "Département",
    "regions": [
      {
        "code": "Adamaoua",
        "nom": "Adamaoua",
        "departements": [
          {
            "code": "Djérem",
            "nom": "Djérem"
          },
          {
            "code": "Faro-et-Déo",
            "nom": "Faro-et-Déo"
          },
          {
            "code": "Mayo-Banyo",
            "nom": "Mayo-Banyo"
          },
          {
            "code": "Mbéré",
            "nom": "Mbéré"
          },
          {
            "code": "Vina",
            "nom": "Vina"
          }
        ]
      },
      {
        "code": "Centre",
        "nom": "Centre",
        "departements": [
          {
            "code": "Haute-Sanaga",
            "nom": "Haute-Sanaga"
          },
          {
            "code": "Lékié",
            "nom": "Lékié"
          },
          {
            "code": "Mbam-et-Inoubou",
            "nom": "Mbam-et-Inoubou"
          },
          {
            "code": "Mbam-et-Kim",
            "nom": "Mbam-et-Kim"
          },
          {
            "code": "Méfou-et-Afamba",
            "nom": "Méfou-et-Afamba"
          },
          {
            "code": "Méfou-et-Akono",
            "nom": "Méfou-et-Akono"
          },
          {
            "code": "Mfoundi",
            "nom": "Mfoundi"
          },
          {
            "code": "Nyong-et-Kéllé",
            "nom": "Nyong-et-Kéllé"
          },
          {
            "code": "Nyong-et-Mfoumou",
            "nom": "Nyong-et-Mfoumou"
          },
          {
            "code": "Nyong-et-So’o",
            "nom": "Nyong-et-So’o"
          }
        ]
      },
      {
        "code": "Est",
        "nom": "Est",
        "departements": [
          {
            "code": "Boumba-et-Ngoko",
            "nom": "Boumba-et-Ngoko"
          },
          {
            "code": "Haut-Nyong",
            "nom": "Haut-Nyong"
          },
          {
            "code": "Kadey",
            "nom": "Kadey"
          },
          {
            "code": "Lom-et-Djérem",
            "nom": "Lom-et-Djérem"
          }
        ]
      },
      {
        "code": "Extrême-Nord",
        "nom": "Extrême-Nord",
        "departements": [
          {
            "code": "Diamaré",
            "nom": "Diamaré"
          },
          {
            "code": "Logone-et-Chari",
            "nom": "Logone-et-Chari"
          },
          {
            "code": "Mayo-Danay",
            "nom": "Mayo-Danay"
          },
          {
            "code": "Mayo-Kani",
            "nom": "Mayo-Kani"
          },
          {
            "code": "Mayo-Sava",
            "nom": "Mayo-Sava"
          },
          {
            "code": "Mayo-Tsanaga",
            "nom": "Mayo-Tsanaga"
          }
        ]
      },
      {
        "code": "Littoral",
        "nom": "Littoral",
        "departements": [
          {
            "code": "Moungo",
            "nom": "Moungo"
          },
          {
            "code": "Nkam",
            "nom": "Nkam"
          },
          {
            "code": "Sanaga-Maritime",
            "nom": "Sanaga-Maritime"
          },
          {
            "code": "Wouri",
            "nom": "Wouri"
          }
        ]
      },
      {
        "code": "Nord",
        "nom": "Nord",
        "departements": [
          {
            "code": "Bénoué",
            "nom": "Bénoué"
          },
          {
            "code": "Faro",
            "nom": "Faro"
          },
          {
            "code": "Mayo-Louti",
            "nom": "Mayo-Louti"
          },
          {
            "code": "Mayo-Rey",
            "nom": "Mayo-Rey"
          }
        ]
      },
      {
        "code": "Nord-Ouest",
        "nom": "Nord-Ouest",
        "departements": [
          {
            "code": "Boyo",
            "nom": "Boyo"
          },
          {
            "code": "Bui",
            "nom": "Bui"
          },
          {
            "code": "Donga-Mantung",
            "nom": "Donga-Mantung"
          },
          {
            "code": "Menchum",
            "nom": "Menchum"
          },
          {
            "code": "Mezam",
            "nom": "Mezam"
          },
          {
            "code": "Momo",
            "nom": "Momo"
          },
          {
            "code": "Ngo-Ketunjia",
            "nom": "Ngo-Ketunjia"
          }
        ]
      },
      {
        "code": "Ouest",
        "nom": "Ouest",
        "departements": [
          {
            "code": "Bamboutos",
            "nom": "Bamboutos"
          },
          {
            "code": "Haut-Nkam",
            "nom": "Haut-Nkam"
          },
          {
            "code": "Hauts-Plateaux",
            "nom": "Hauts-Plateaux"
          },
          {
            "code": "Koung-Khi",
            "nom": "Koung-Khi"
          },
          {
            "code": "Menoua",
            "nom": "Menoua"
          },
          {
            "code": "Mifi",
            "nom": "Mifi"
          },
          {
            "code": "Ndé",
            "nom": "Ndé"
          },
          {
            "code": "Noun",
            "nom": "Noun"
          }
        ]
      },
      {
        "code": "Sud",
        "nom": "Sud",
        "departements": [
          {
            "code": "Dja-et-Lobo",
            "nom": "Dja-et-Lobo"
          },
          {
            "code": "Mvila",
            "nom": "Mvila"
          },
          {
            "code": "Océan",
            "nom": "Océan"
          },
          {
            "code": "Vallée-du-Ntem",
            "nom": "Vallée-du-Ntem"
          }
        ]
      },
      {
        "code": "Sud-Ouest",
        "nom": "Sud-Ouest",
        "departements": [
          {
            "code": "Fako",
            "nom": "Fako"
          },
          {
            "code": "Koupé-Manengouba",
            "nom": "Koupé-Manengouba"
          },
          {
            "code": "Lebialem",
            "nom": "Lebialem"
          },
          {
            "code": "Manyu",
            "nom": "Manyu"
          },
          {
            "code": "Meme",
            "nom": "Meme"
          },
          {
            "code": "Ndian",
            "nom": "Ndian"
          }
        ]
      }
    ]
  },
  "FR": {
    "regionLabel": "Région",
    "departementLabel": "Département",
    "regions": [
      {
        "code": "FR-ARA",
        "nom": "Auvergne-Rhône-Alpes",
        "departements": [
          {
            "code": "FR-01",
            "nom": "Ain"
          },
          {
            "code": "FR-03",
            "nom": "Allier"
          },
          {
            "code": "FR-07",
            "nom": "Ardèche"
          },
          {
            "code": "FR-15",
            "nom": "Cantal"
          },
          {
            "code": "FR-26",
            "nom": "Drôme"
          },
          {
            "code": "FR-43",
            "nom": "Haute-Loire"
          },
          {
            "code": "FR-74",
            "nom": "Haute-Savoie"
          },
          {
            "code": "FR-38",
            "nom": "Isère"
          },
          {
            "code": "FR-42",
            "nom": "Loire"
          },
          {
            "code": "FR-63",
            "nom": "Puy-de-Dôme"
          },
          {
            "code": "FR-69",
            "nom": "Rhône"
          },
          {
            "code": "FR-73",
            "nom": "Savoie"
          }
        ]
      },
      {
        "code": "FR-BFC",
        "nom": "Bourgogne-Franche-Comté",
        "departements": [
          {
            "code": "FR-21",
            "nom": "Côte-d'Or"
          },
          {
            "code": "FR-25",
            "nom": "Doubs"
          },
          {
            "code": "FR-70",
            "nom": "Haute-Saône"
          },
          {
            "code": "FR-39",
            "nom": "Jura"
          },
          {
            "code": "FR-58",
            "nom": "Nièvre"
          },
          {
            "code": "FR-71",
            "nom": "Saône-et-Loire"
          },
          {
            "code": "FR-90",
            "nom": "Territoire de Belfort"
          },
          {
            "code": "FR-89",
            "nom": "Yonne"
          }
        ]
      },
      {
        "code": "FR-BRE",
        "nom": "Bretagne",
        "departements": [
          {
            "code": "FR-22",
            "nom": "Côtes-d'Armor"
          },
          {
            "code": "FR-29",
            "nom": "Finistère"
          },
          {
            "code": "FR-35",
            "nom": "Ille-et-Vilaine"
          },
          {
            "code": "FR-56",
            "nom": "Morbihan"
          }
        ]
      },
      {
        "code": "FR-CVL",
        "nom": "Centre-Val de Loire",
        "departements": [
          {
            "code": "FR-18",
            "nom": "Cher"
          },
          {
            "code": "FR-28",
            "nom": "Eure-et-Loir"
          },
          {
            "code": "FR-36",
            "nom": "Indre"
          },
          {
            "code": "FR-37",
            "nom": "Indre-et-Loire"
          },
          {
            "code": "FR-41",
            "nom": "Loir-et-Cher"
          },
          {
            "code": "FR-45",
            "nom": "Loiret"
          }
        ]
      },
      {
        "code": "FR-20R",
        "nom": "Corse",
        "departements": [
          {
            "code": "FR-2A",
            "nom": "Corse-du-Sud"
          },
          {
            "code": "FR-2B",
            "nom": "Haute-Corse"
          }
        ]
      },
      {
        "code": "FR-GES",
        "nom": "Grand-Est",
        "departements": [
          {
            "code": "FR-08",
            "nom": "Ardennes"
          },
          {
            "code": "FR-10",
            "nom": "Aube"
          },
          {
            "code": "FR-67",
            "nom": "Bas-Rhin"
          },
          {
            "code": "FR-68",
            "nom": "Haut-Rhin"
          },
          {
            "code": "FR-52",
            "nom": "Haute-Marne"
          },
          {
            "code": "FR-51",
            "nom": "Marne"
          },
          {
            "code": "FR-54",
            "nom": "Meurthe-et-Moselle"
          },
          {
            "code": "FR-55",
            "nom": "Meuse"
          },
          {
            "code": "FR-57",
            "nom": "Moselle"
          },
          {
            "code": "FR-88",
            "nom": "Vosges"
          }
        ]
      },
      {
        "code": "FR-971",
        "nom": "Guadeloupe",
        "departements": [
          {
            "code": "FR-971",
            "nom": "Guadeloupe"
          }
        ]
      },
      {
        "code": "FR-973",
        "nom": "Guyane",
        "departements": [
          {
            "code": "FR-973",
            "nom": "Guyane"
          }
        ]
      },
      {
        "code": "FR-HDF",
        "nom": "Hauts-de-France",
        "departements": [
          {
            "code": "FR-02",
            "nom": "Aisne"
          },
          {
            "code": "FR-59",
            "nom": "Nord"
          },
          {
            "code": "FR-60",
            "nom": "Oise"
          },
          {
            "code": "FR-62",
            "nom": "Pas-de-Calais"
          },
          {
            "code": "FR-80",
            "nom": "Somme"
          }
        ]
      },
      {
        "code": "FR-974",
        "nom": "La Réunion",
        "departements": [
          {
            "code": "FR-974",
            "nom": "La Réunion"
          }
        ]
      },
      {
        "code": "FR-972",
        "nom": "Martinique",
        "departements": [
          {
            "code": "FR-972",
            "nom": "Martinique"
          }
        ]
      },
      {
        "code": "FR-976",
        "nom": "Mayotte",
        "departements": [
          {
            "code": "FR-976",
            "nom": "Mayotte"
          }
        ]
      },
      {
        "code": "FR-NOR",
        "nom": "Normandie",
        "departements": [
          {
            "code": "FR-14",
            "nom": "Calvados"
          },
          {
            "code": "FR-27",
            "nom": "Eure"
          },
          {
            "code": "FR-50",
            "nom": "Manche"
          },
          {
            "code": "FR-61",
            "nom": "Orne"
          },
          {
            "code": "FR-76",
            "nom": "Seine-Maritime"
          }
        ]
      },
      {
        "code": "FR-NAQ",
        "nom": "Nouvelle-Aquitaine",
        "departements": [
          {
            "code": "FR-16",
            "nom": "Charente"
          },
          {
            "code": "FR-17",
            "nom": "Charente-Maritime"
          },
          {
            "code": "FR-19",
            "nom": "Corrèze"
          },
          {
            "code": "FR-23",
            "nom": "Creuse"
          },
          {
            "code": "FR-79",
            "nom": "Deux-Sèvres"
          },
          {
            "code": "FR-24",
            "nom": "Dordogne"
          },
          {
            "code": "FR-33",
            "nom": "Gironde"
          },
          {
            "code": "FR-87",
            "nom": "Haute-Vienne"
          },
          {
            "code": "FR-40",
            "nom": "Landes"
          },
          {
            "code": "FR-47",
            "nom": "Lot-et-Garonne"
          },
          {
            "code": "FR-64",
            "nom": "Pyrénées-Atlantiques"
          },
          {
            "code": "FR-86",
            "nom": "Vienne"
          }
        ]
      },
      {
        "code": "FR-OCC",
        "nom": "Occitanie",
        "departements": [
          {
            "code": "FR-09",
            "nom": "Ariège"
          },
          {
            "code": "FR-11",
            "nom": "Aude"
          },
          {
            "code": "FR-12",
            "nom": "Aveyron"
          },
          {
            "code": "FR-30",
            "nom": "Gard"
          },
          {
            "code": "FR-32",
            "nom": "Gers"
          },
          {
            "code": "FR-31",
            "nom": "Haute-Garonne"
          },
          {
            "code": "FR-65",
            "nom": "Hautes-Pyrénées"
          },
          {
            "code": "FR-34",
            "nom": "Hérault"
          },
          {
            "code": "FR-46",
            "nom": "Lot"
          },
          {
            "code": "FR-48",
            "nom": "Lozère"
          },
          {
            "code": "FR-66",
            "nom": "Pyrénées-Orientales"
          },
          {
            "code": "FR-81",
            "nom": "Tarn"
          },
          {
            "code": "FR-82",
            "nom": "Tarn-et-Garonne"
          }
        ]
      },
      {
        "code": "FR-PDL",
        "nom": "Pays-de-la-Loire",
        "departements": [
          {
            "code": "FR-44",
            "nom": "Loire-Atlantique"
          },
          {
            "code": "FR-49",
            "nom": "Maine-et-Loire"
          },
          {
            "code": "FR-53",
            "nom": "Mayenne"
          },
          {
            "code": "FR-72",
            "nom": "Sarthe"
          },
          {
            "code": "FR-85",
            "nom": "Vendée"
          }
        ]
      },
      {
        "code": "FR-PAC",
        "nom": "Provence-Alpes-Côte-d’Azur",
        "departements": [
          {
            "code": "FR-06",
            "nom": "Alpes-Maritimes"
          },
          {
            "code": "FR-04",
            "nom": "Alpes-de-Haute-Provence"
          },
          {
            "code": "FR-13",
            "nom": "Bouches-du-Rhône"
          },
          {
            "code": "FR-05",
            "nom": "Hautes-Alpes"
          },
          {
            "code": "FR-83",
            "nom": "Var"
          },
          {
            "code": "FR-84",
            "nom": "Vaucluse"
          }
        ]
      },
      {
        "code": "FR-IDF",
        "nom": "Île-de-France",
        "departements": [
          {
            "code": "FR-91",
            "nom": "Essonne"
          },
          {
            "code": "FR-92",
            "nom": "Hauts-de-Seine"
          },
          {
            "code": "FR-75",
            "nom": "Paris"
          },
          {
            "code": "FR-93",
            "nom": "Seine-Saint-Denis"
          },
          {
            "code": "FR-77",
            "nom": "Seine-et-Marne"
          },
          {
            "code": "FR-95",
            "nom": "Val-d'Oise"
          },
          {
            "code": "FR-94",
            "nom": "Val-de-Marne"
          },
          {
            "code": "FR-78",
            "nom": "Yvelines"
          }
        ]
      }
    ]
  },
  "US": {
    "regionLabel": "État / territoire",
    "departementLabel": "Comté / County",
    "regions": [
      {
        "code": "US-AL",
        "nom": "Alabama"
      },
      {
        "code": "US-AK",
        "nom": "Alaska"
      },
      {
        "code": "US-AS",
        "nom": "American Samoa"
      },
      {
        "code": "US-AZ",
        "nom": "Arizona"
      },
      {
        "code": "US-AR",
        "nom": "Arkansas"
      },
      {
        "code": "US-CA",
        "nom": "California"
      },
      {
        "code": "US-CO",
        "nom": "Colorado"
      },
      {
        "code": "US-CT",
        "nom": "Connecticut"
      },
      {
        "code": "US-DE",
        "nom": "Delaware"
      },
      {
        "code": "US-DC",
        "nom": "District of Columbia"
      },
      {
        "code": "US-FL",
        "nom": "Florida"
      },
      {
        "code": "US-GA",
        "nom": "Georgia"
      },
      {
        "code": "US-GU",
        "nom": "Guam"
      },
      {
        "code": "US-HI",
        "nom": "Hawaii"
      },
      {
        "code": "US-ID",
        "nom": "Idaho"
      },
      {
        "code": "US-IL",
        "nom": "Illinois"
      },
      {
        "code": "US-IN",
        "nom": "Indiana"
      },
      {
        "code": "US-IA",
        "nom": "Iowa"
      },
      {
        "code": "US-KS",
        "nom": "Kansas"
      },
      {
        "code": "US-KY",
        "nom": "Kentucky"
      },
      {
        "code": "US-LA",
        "nom": "Louisiana"
      },
      {
        "code": "US-ME",
        "nom": "Maine"
      },
      {
        "code": "US-MD",
        "nom": "Maryland"
      },
      {
        "code": "US-MA",
        "nom": "Massachusetts"
      },
      {
        "code": "US-MI",
        "nom": "Michigan"
      },
      {
        "code": "US-MN",
        "nom": "Minnesota"
      },
      {
        "code": "US-MS",
        "nom": "Mississippi"
      },
      {
        "code": "US-MO",
        "nom": "Missouri"
      },
      {
        "code": "US-MT",
        "nom": "Montana"
      },
      {
        "code": "US-NE",
        "nom": "Nebraska"
      },
      {
        "code": "US-NV",
        "nom": "Nevada"
      },
      {
        "code": "US-NH",
        "nom": "New Hampshire"
      },
      {
        "code": "US-NJ",
        "nom": "New Jersey"
      },
      {
        "code": "US-NM",
        "nom": "New Mexico"
      },
      {
        "code": "US-NY",
        "nom": "New York"
      },
      {
        "code": "US-NC",
        "nom": "North Carolina"
      },
      {
        "code": "US-ND",
        "nom": "North Dakota"
      },
      {
        "code": "US-MP",
        "nom": "Northern Mariana Islands"
      },
      {
        "code": "US-OH",
        "nom": "Ohio"
      },
      {
        "code": "US-OK",
        "nom": "Oklahoma"
      },
      {
        "code": "US-OR",
        "nom": "Oregon"
      },
      {
        "code": "US-PA",
        "nom": "Pennsylvania"
      },
      {
        "code": "US-PR",
        "nom": "Puerto Rico"
      },
      {
        "code": "US-RI",
        "nom": "Rhode Island"
      },
      {
        "code": "US-SC",
        "nom": "South Carolina"
      },
      {
        "code": "US-SD",
        "nom": "South Dakota"
      },
      {
        "code": "US-TN",
        "nom": "Tennessee"
      },
      {
        "code": "US-TX",
        "nom": "Texas"
      },
      {
        "code": "US-UM",
        "nom": "United States Minor Outlying Islands"
      },
      {
        "code": "US-UT",
        "nom": "Utah"
      },
      {
        "code": "US-VT",
        "nom": "Vermont"
      },
      {
        "code": "US-VI",
        "nom": "Virgin Islands, U.S."
      },
      {
        "code": "US-VA",
        "nom": "Virginia"
      },
      {
        "code": "US-WA",
        "nom": "Washington"
      },
      {
        "code": "US-WV",
        "nom": "West Virginia"
      },
      {
        "code": "US-WI",
        "nom": "Wisconsin"
      },
      {
        "code": "US-WY",
        "nom": "Wyoming"
      }
    ]
  },
  "CA": {
    "regionLabel": "Province / territoire",
    "departementLabel": "Division administrative",
    "regions": [
      {
        "code": "CA-AB",
        "nom": "Alberta"
      },
      {
        "code": "CA-BC",
        "nom": "Colombie-Britannique"
      },
      {
        "code": "CA-MB",
        "nom": "Manitoba"
      },
      {
        "code": "CA-NB",
        "nom": "Nouveau-Brunswick"
      },
      {
        "code": "CA-NS",
        "nom": "Nouvelle-Écosse"
      },
      {
        "code": "CA-NU",
        "nom": "Nunavut"
      },
      {
        "code": "CA-ON",
        "nom": "Ontario"
      },
      {
        "code": "CA-QC",
        "nom": "Québec"
      },
      {
        "code": "CA-SK",
        "nom": "Saskatchewan"
      },
      {
        "code": "CA-NL",
        "nom": "Terre-Neuve-et-Labrador"
      },
      {
        "code": "CA-NT",
        "nom": "Territoires du Nord-Ouest"
      },
      {
        "code": "CA-YT",
        "nom": "Yukon"
      },
      {
        "code": "CA-PE",
        "nom": "Île-du-Prince-Édouard"
      }
    ]
  },
  "DE": {
    "regionLabel": "Land (État fédéré)",
    "departementLabel": "Arrondissement / Kreis",
    "regions": [
      {
        "code": "DE-BW",
        "nom": "Baden-Württemberg"
      },
      {
        "code": "DE-BY",
        "nom": "Bayern"
      },
      {
        "code": "DE-BE",
        "nom": "Berlin"
      },
      {
        "code": "DE-BB",
        "nom": "Brandenburg"
      },
      {
        "code": "DE-HB",
        "nom": "Bremen"
      },
      {
        "code": "DE-HH",
        "nom": "Hamburg"
      },
      {
        "code": "DE-HE",
        "nom": "Hessen"
      },
      {
        "code": "DE-MV",
        "nom": "Mecklenburg-Vorpommern"
      },
      {
        "code": "DE-NI",
        "nom": "Niedersachsen"
      },
      {
        "code": "DE-NW",
        "nom": "Nordrhein-Westfalen"
      },
      {
        "code": "DE-RP",
        "nom": "Rheinland-Pfalz"
      },
      {
        "code": "DE-SL",
        "nom": "Saarland"
      },
      {
        "code": "DE-SN",
        "nom": "Sachsen"
      },
      {
        "code": "DE-ST",
        "nom": "Sachsen-Anhalt"
      },
      {
        "code": "DE-SH",
        "nom": "Schleswig-Holstein"
      },
      {
        "code": "DE-TH",
        "nom": "Thüringen"
      }
    ]
  },
  "GB": {
    "regionLabel": "Nation constitutive",
    "departementLabel": "Comté / autorité locale",
    "regions": [
      {
        "code": "GB-ENG",
        "nom": "Angleterre",
        "departements": [
          {
            "code": "GB-BDG",
            "nom": "Barking and Dagenham"
          },
          {
            "code": "GB-BNE",
            "nom": "Barnet"
          },
          {
            "code": "GB-BNS",
            "nom": "Barnsley"
          },
          {
            "code": "GB-BAS",
            "nom": "Bath and North East Somerset"
          },
          {
            "code": "GB-BDF",
            "nom": "Bedford"
          },
          {
            "code": "GB-BEX",
            "nom": "Bexley"
          },
          {
            "code": "GB-BIR",
            "nom": "Birmingham"
          },
          {
            "code": "GB-BBD",
            "nom": "Blackburn with Darwen"
          },
          {
            "code": "GB-BPL",
            "nom": "Blackpool"
          },
          {
            "code": "GB-BOL",
            "nom": "Bolton"
          },
          {
            "code": "GB-BCP",
            "nom": "Bournemouth, Christchurch and Poole"
          },
          {
            "code": "GB-BRC",
            "nom": "Bracknell Forest"
          },
          {
            "code": "GB-BRD",
            "nom": "Bradford"
          },
          {
            "code": "GB-BEN",
            "nom": "Brent"
          },
          {
            "code": "GB-BNH",
            "nom": "Brighton and Hove"
          },
          {
            "code": "GB-BST",
            "nom": "Bristol, City of"
          },
          {
            "code": "GB-BRY",
            "nom": "Bromley"
          },
          {
            "code": "GB-BKM",
            "nom": "Buckinghamshire"
          },
          {
            "code": "GB-BUR",
            "nom": "Bury"
          },
          {
            "code": "GB-CLD",
            "nom": "Calderdale"
          },
          {
            "code": "GB-CAM",
            "nom": "Cambridgeshire"
          },
          {
            "code": "GB-CMD",
            "nom": "Camden"
          },
          {
            "code": "GB-CBF",
            "nom": "Central Bedfordshire"
          },
          {
            "code": "GB-CHE",
            "nom": "Cheshire East"
          },
          {
            "code": "GB-CHW",
            "nom": "Cheshire West and Chester"
          },
          {
            "code": "GB-CON",
            "nom": "Cornwall"
          },
          {
            "code": "GB-COV",
            "nom": "Coventry"
          },
          {
            "code": "GB-CRY",
            "nom": "Croydon"
          },
          {
            "code": "GB-CMA",
            "nom": "Cumbria"
          },
          {
            "code": "GB-DAL",
            "nom": "Darlington"
          },
          {
            "code": "GB-DER",
            "nom": "Derby"
          },
          {
            "code": "GB-DBY",
            "nom": "Derbyshire"
          },
          {
            "code": "GB-DEV",
            "nom": "Devon"
          },
          {
            "code": "GB-DNC",
            "nom": "Doncaster"
          },
          {
            "code": "GB-DOR",
            "nom": "Dorset"
          },
          {
            "code": "GB-DUD",
            "nom": "Dudley"
          },
          {
            "code": "GB-DUR",
            "nom": "Durham, County"
          },
          {
            "code": "GB-EAL",
            "nom": "Ealing"
          },
          {
            "code": "GB-ERY",
            "nom": "East Riding of Yorkshire"
          },
          {
            "code": "GB-ESX",
            "nom": "East Sussex"
          },
          {
            "code": "GB-ENF",
            "nom": "Enfield"
          },
          {
            "code": "GB-ESS",
            "nom": "Essex"
          },
          {
            "code": "GB-GAT",
            "nom": "Gateshead"
          },
          {
            "code": "GB-GLS",
            "nom": "Gloucestershire"
          },
          {
            "code": "GB-GRE",
            "nom": "Greenwich"
          },
          {
            "code": "GB-HCK",
            "nom": "Hackney"
          },
          {
            "code": "GB-HAL",
            "nom": "Halton"
          },
          {
            "code": "GB-HMF",
            "nom": "Hammersmith and Fulham"
          },
          {
            "code": "GB-HAM",
            "nom": "Hampshire"
          },
          {
            "code": "GB-HRY",
            "nom": "Haringey"
          },
          {
            "code": "GB-HRW",
            "nom": "Harrow"
          },
          {
            "code": "GB-HPL",
            "nom": "Hartlepool"
          },
          {
            "code": "GB-HAV",
            "nom": "Havering"
          },
          {
            "code": "GB-HEF",
            "nom": "Herefordshire"
          },
          {
            "code": "GB-HRT",
            "nom": "Hertfordshire"
          },
          {
            "code": "GB-HIL",
            "nom": "Hillingdon"
          },
          {
            "code": "GB-HNS",
            "nom": "Hounslow"
          },
          {
            "code": "GB-IOW",
            "nom": "Isle of Wight"
          },
          {
            "code": "GB-IOS",
            "nom": "Isles of Scilly"
          },
          {
            "code": "GB-ISL",
            "nom": "Islington"
          },
          {
            "code": "GB-KEC",
            "nom": "Kensington and Chelsea"
          },
          {
            "code": "GB-KEN",
            "nom": "Kent"
          },
          {
            "code": "GB-KHL",
            "nom": "Kingston upon Hull"
          },
          {
            "code": "GB-KTT",
            "nom": "Kingston upon Thames"
          },
          {
            "code": "GB-KIR",
            "nom": "Kirklees"
          },
          {
            "code": "GB-KWL",
            "nom": "Knowsley"
          },
          {
            "code": "GB-LBH",
            "nom": "Lambeth"
          },
          {
            "code": "GB-LAN",
            "nom": "Lancashire"
          },
          {
            "code": "GB-LDS",
            "nom": "Leeds"
          },
          {
            "code": "GB-LCE",
            "nom": "Leicester"
          },
          {
            "code": "GB-LEC",
            "nom": "Leicestershire"
          },
          {
            "code": "GB-LEW",
            "nom": "Lewisham"
          },
          {
            "code": "GB-LIN",
            "nom": "Lincolnshire"
          },
          {
            "code": "GB-LIV",
            "nom": "Liverpool"
          },
          {
            "code": "GB-LND",
            "nom": "London, City of"
          },
          {
            "code": "GB-LUT",
            "nom": "Luton"
          },
          {
            "code": "GB-MAN",
            "nom": "Manchester"
          },
          {
            "code": "GB-MDW",
            "nom": "Medway"
          },
          {
            "code": "GB-MRT",
            "nom": "Merton"
          },
          {
            "code": "GB-MDB",
            "nom": "Middlesbrough"
          },
          {
            "code": "GB-MIK",
            "nom": "Milton Keynes"
          },
          {
            "code": "GB-NET",
            "nom": "Newcastle upon Tyne"
          },
          {
            "code": "GB-NWM",
            "nom": "Newham"
          },
          {
            "code": "GB-NFK",
            "nom": "Norfolk"
          },
          {
            "code": "GB-NEL",
            "nom": "North East Lincolnshire"
          },
          {
            "code": "GB-NLN",
            "nom": "North Lincolnshire"
          },
          {
            "code": "GB-NNH",
            "nom": "North Northamptonshire"
          },
          {
            "code": "GB-NSM",
            "nom": "North Somerset"
          },
          {
            "code": "GB-NTY",
            "nom": "North Tyneside"
          },
          {
            "code": "GB-NYK",
            "nom": "North Yorkshire"
          },
          {
            "code": "GB-NBL",
            "nom": "Northumberland"
          },
          {
            "code": "GB-NGM",
            "nom": "Nottingham"
          },
          {
            "code": "GB-NTT",
            "nom": "Nottinghamshire"
          },
          {
            "code": "GB-OLD",
            "nom": "Oldham"
          },
          {
            "code": "GB-OXF",
            "nom": "Oxfordshire"
          },
          {
            "code": "GB-PTE",
            "nom": "Peterborough"
          },
          {
            "code": "GB-PLY",
            "nom": "Plymouth"
          },
          {
            "code": "GB-POR",
            "nom": "Portsmouth"
          },
          {
            "code": "GB-RDG",
            "nom": "Reading"
          },
          {
            "code": "GB-RDB",
            "nom": "Redbridge"
          },
          {
            "code": "GB-RCC",
            "nom": "Redcar and Cleveland"
          },
          {
            "code": "GB-RIC",
            "nom": "Richmond upon Thames"
          },
          {
            "code": "GB-RCH",
            "nom": "Rochdale"
          },
          {
            "code": "GB-ROT",
            "nom": "Rotherham"
          },
          {
            "code": "GB-RUT",
            "nom": "Rutland"
          },
          {
            "code": "GB-SLF",
            "nom": "Salford"
          },
          {
            "code": "GB-SAW",
            "nom": "Sandwell"
          },
          {
            "code": "GB-SFT",
            "nom": "Sefton"
          },
          {
            "code": "GB-SHF",
            "nom": "Sheffield"
          },
          {
            "code": "GB-SHR",
            "nom": "Shropshire"
          },
          {
            "code": "GB-SLG",
            "nom": "Slough"
          },
          {
            "code": "GB-SOL",
            "nom": "Solihull"
          },
          {
            "code": "GB-SOM",
            "nom": "Somerset"
          },
          {
            "code": "GB-SGC",
            "nom": "South Gloucestershire"
          },
          {
            "code": "GB-STY",
            "nom": "South Tyneside"
          },
          {
            "code": "GB-STH",
            "nom": "Southampton"
          },
          {
            "code": "GB-SOS",
            "nom": "Southend-on-Sea"
          },
          {
            "code": "GB-SWK",
            "nom": "Southwark"
          },
          {
            "code": "GB-SHN",
            "nom": "St. Helens"
          },
          {
            "code": "GB-STS",
            "nom": "Staffordshire"
          },
          {
            "code": "GB-SKP",
            "nom": "Stockport"
          },
          {
            "code": "GB-STT",
            "nom": "Stockton-on-Tees"
          },
          {
            "code": "GB-STE",
            "nom": "Stoke-on-Trent"
          },
          {
            "code": "GB-SFK",
            "nom": "Suffolk"
          },
          {
            "code": "GB-SND",
            "nom": "Sunderland"
          },
          {
            "code": "GB-SRY",
            "nom": "Surrey"
          },
          {
            "code": "GB-STN",
            "nom": "Sutton"
          },
          {
            "code": "GB-SWD",
            "nom": "Swindon"
          },
          {
            "code": "GB-TAM",
            "nom": "Tameside"
          },
          {
            "code": "GB-TFW",
            "nom": "Telford and Wrekin"
          },
          {
            "code": "GB-THR",
            "nom": "Thurrock"
          },
          {
            "code": "GB-TOB",
            "nom": "Torbay"
          },
          {
            "code": "GB-TWH",
            "nom": "Tower Hamlets"
          },
          {
            "code": "GB-TRF",
            "nom": "Trafford"
          },
          {
            "code": "GB-WKF",
            "nom": "Wakefield"
          },
          {
            "code": "GB-WLL",
            "nom": "Walsall"
          },
          {
            "code": "GB-WFT",
            "nom": "Waltham Forest"
          },
          {
            "code": "GB-WND",
            "nom": "Wandsworth"
          },
          {
            "code": "GB-WRT",
            "nom": "Warrington"
          },
          {
            "code": "GB-WAR",
            "nom": "Warwickshire"
          },
          {
            "code": "GB-WBK",
            "nom": "West Berkshire"
          },
          {
            "code": "GB-WNH",
            "nom": "West Northamptonshire"
          },
          {
            "code": "GB-WSX",
            "nom": "West Sussex"
          },
          {
            "code": "GB-WSM",
            "nom": "Westminster"
          },
          {
            "code": "GB-WGN",
            "nom": "Wigan"
          },
          {
            "code": "GB-WIL",
            "nom": "Wiltshire"
          },
          {
            "code": "GB-WNM",
            "nom": "Windsor and Maidenhead"
          },
          {
            "code": "GB-WRL",
            "nom": "Wirral"
          },
          {
            "code": "GB-WOK",
            "nom": "Wokingham"
          },
          {
            "code": "GB-WLV",
            "nom": "Wolverhampton"
          },
          {
            "code": "GB-WOR",
            "nom": "Worcestershire"
          },
          {
            "code": "GB-YOR",
            "nom": "York"
          }
        ]
      },
      {
        "code": "GB-SCT",
        "nom": "Écosse",
        "departements": [
          {
            "code": "GB-ABE",
            "nom": "Aberdeen City"
          },
          {
            "code": "GB-ABD",
            "nom": "Aberdeenshire"
          },
          {
            "code": "GB-ANS",
            "nom": "Angus"
          },
          {
            "code": "GB-AGB",
            "nom": "Argyll and Bute"
          },
          {
            "code": "GB-CLK",
            "nom": "Clackmannanshire"
          },
          {
            "code": "GB-DGY",
            "nom": "Dumfries and Galloway"
          },
          {
            "code": "GB-DND",
            "nom": "Dundee City"
          },
          {
            "code": "GB-EAY",
            "nom": "East Ayrshire"
          },
          {
            "code": "GB-EDU",
            "nom": "East Dunbartonshire"
          },
          {
            "code": "GB-ELN",
            "nom": "East Lothian"
          },
          {
            "code": "GB-ERW",
            "nom": "East Renfrewshire"
          },
          {
            "code": "GB-EDH",
            "nom": "Edinburgh, City of"
          },
          {
            "code": "GB-ELS",
            "nom": "Eilean Siar"
          },
          {
            "code": "GB-FAL",
            "nom": "Falkirk"
          },
          {
            "code": "GB-FIF",
            "nom": "Fife"
          },
          {
            "code": "GB-GLG",
            "nom": "Glasgow City"
          },
          {
            "code": "GB-HLD",
            "nom": "Highland"
          },
          {
            "code": "GB-IVC",
            "nom": "Inverclyde"
          },
          {
            "code": "GB-MLN",
            "nom": "Midlothian"
          },
          {
            "code": "GB-MRY",
            "nom": "Moray"
          },
          {
            "code": "GB-NAY",
            "nom": "North Ayrshire"
          },
          {
            "code": "GB-NLK",
            "nom": "North Lanarkshire"
          },
          {
            "code": "GB-ORK",
            "nom": "Orkney Islands"
          },
          {
            "code": "GB-PKN",
            "nom": "Perth and Kinross"
          },
          {
            "code": "GB-RFW",
            "nom": "Renfrewshire"
          },
          {
            "code": "GB-SCB",
            "nom": "Scottish Borders"
          },
          {
            "code": "GB-ZET",
            "nom": "Shetland Islands"
          },
          {
            "code": "GB-SAY",
            "nom": "South Ayrshire"
          },
          {
            "code": "GB-SLK",
            "nom": "South Lanarkshire"
          },
          {
            "code": "GB-STG",
            "nom": "Stirling"
          },
          {
            "code": "GB-WDU",
            "nom": "West Dunbartonshire"
          },
          {
            "code": "GB-WLN",
            "nom": "West Lothian"
          }
        ]
      },
      {
        "code": "GB-WLS",
        "nom": "Pays de Galles",
        "departements": [
          {
            "code": "GB-BGW",
            "nom": "Blaenau Gwent"
          },
          {
            "code": "GB-BGE",
            "nom": "Bridgend [Pen-y-bont ar Ogwr GB-POG]"
          },
          {
            "code": "GB-CAY",
            "nom": "Caerphilly [Caerffili GB-CAF]"
          },
          {
            "code": "GB-CRF",
            "nom": "Cardiff [Caerdydd GB-CRD]"
          },
          {
            "code": "GB-CMN",
            "nom": "Carmarthenshire [Sir Gaerfyrddin GB-GFY]"
          },
          {
            "code": "GB-CGN",
            "nom": "Ceredigion [Sir Ceredigion]"
          },
          {
            "code": "GB-CWY",
            "nom": "Conwy"
          },
          {
            "code": "GB-DEN",
            "nom": "Denbighshire [Sir Ddinbych GB-DDB]"
          },
          {
            "code": "GB-FLN",
            "nom": "Flintshire [Sir y Fflint GB-FFL]"
          },
          {
            "code": "GB-GWN",
            "nom": "Gwynedd"
          },
          {
            "code": "GB-AGY",
            "nom": "Isle of Anglesey [Sir Ynys Môn GB-YNM]"
          },
          {
            "code": "GB-MTY",
            "nom": "Merthyr Tydfil [Merthyr Tudful GB-MTU]"
          },
          {
            "code": "GB-MON",
            "nom": "Monmouthshire [Sir Fynwy GB-FYN]"
          },
          {
            "code": "GB-NTL",
            "nom": "Neath Port Talbot [Castell-nedd Port Talbot GB-CTL]"
          },
          {
            "code": "GB-NWP",
            "nom": "Newport [Casnewydd GB-CNW]"
          },
          {
            "code": "GB-PEM",
            "nom": "Pembrokeshire [Sir Benfro GB-BNF]"
          },
          {
            "code": "GB-POW",
            "nom": "Powys"
          },
          {
            "code": "GB-RCT",
            "nom": "Rhondda Cynon Taff [Rhondda CynonTaf]"
          },
          {
            "code": "GB-SWA",
            "nom": "Swansea [Abertawe GB-ATA]"
          },
          {
            "code": "GB-TOF",
            "nom": "Torfaen [Tor-faen]"
          },
          {
            "code": "GB-VGL",
            "nom": "Vale of Glamorgan, The [Bro Morgannwg GB-BMG]"
          },
          {
            "code": "GB-WRX",
            "nom": "Wrexham [Wrecsam GB-WRC]"
          }
        ]
      },
      {
        "code": "GB-NIR",
        "nom": "Irlande du Nord",
        "departements": [
          {
            "code": "GB-ANN",
            "nom": "Antrim and Newtownabbey"
          },
          {
            "code": "GB-AND",
            "nom": "Ards and North Down"
          },
          {
            "code": "GB-ABC",
            "nom": "Armagh City, Banbridge and Craigavon"
          },
          {
            "code": "GB-BFS",
            "nom": "Belfast City"
          },
          {
            "code": "GB-CCG",
            "nom": "Causeway Coast and Glens"
          },
          {
            "code": "GB-DRS",
            "nom": "Derry and Strabane"
          },
          {
            "code": "GB-FMO",
            "nom": "Fermanagh and Omagh"
          },
          {
            "code": "GB-LBC",
            "nom": "Lisburn and Castlereagh"
          },
          {
            "code": "GB-MEA",
            "nom": "Mid and East Antrim"
          },
          {
            "code": "GB-MUL",
            "nom": "Mid-Ulster"
          },
          {
            "code": "GB-NMD",
            "nom": "Newry, Mourne and Down"
          }
        ]
      }
    ]
  }
};
