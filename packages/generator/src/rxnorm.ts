import { createReference } from '@medplum/core';
import {
  Bundle,
  CodeableConcept,
  Extension,
  Medication,
  MedicationIngredient,
  MedicationKnowledge,
  MedicationKnowledgeIngredient,
  Ratio,
  Resource,
  Substance,
} from '@medplum/fhirtypes';
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

class MultiMap<K, V> {
  inner: Map<K, V[]> = new Map();

  set(key: K, value: V): void {
    this.get(key).push(value);
  }

  get(key: K): V[] {
    let result = this.inner.get(key);
    if (!result) {
      result = [];
      this.inner.set(key, result);
    }
    return result;
  }
}

class TableMap<K1, K2, V> {
  inner: Map<K1, Map<K2, V>> = new Map();

  set(key1: K1, key2: K2, value: V): void {
    const row = this.get(key1);
    row.set(key2, value);
  }

  get(key1: K1): Map<K2, V> {
    let result = this.inner.get(key1);
    if (!result) {
      result = new Map();
      this.inner.set(key1, result);
    }
    return result;
  }
}

let startTime = 0;

const FHIR_SERVER_URL = 'http://localhost:8080/hapi-fhir-jpaserver/fhir/';
const RXNORM_SYSTEM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

// rxNorm concepts
// rxCui, CodeableConcept
const ingredients: Map<string, CodeableConcept> = new Map();
const brandNames: Map<string, CodeableConcept> = new Map();
const doseForms: Map<string, CodeableConcept> = new Map();
const rxNormConcepts: Map<string, CodeableConcept> = new Map();
const preciseIngredients: Map<string, CodeableConcept> = new Map();

// rxNorm one-to-one relationships
// source rxCui, target rxCui
const hasDoseForm: Map<string, string> = new Map();
const hasDoseFormGroup: Map<string, string> = new Map();

// rxNorm one-to-many relationships
// source rxCui, target rxCui
const hasIngredient: MultiMap<string, string> = new MultiMap();
const consistsOf: MultiMap<string, string> = new MultiMap();
const contains: MultiMap<string, string> = new MultiMap();
const isa: MultiMap<string, string> = new MultiMap();
const hasForm: MultiMap<string, string> = new MultiMap();
const tradeNameOf: MultiMap<string, string> = new MultiMap();

// rxNorm attributes
// rxCui, ATN, ATV
const attributes: TableMap<string, string, string> = new TableMap();

// rxNorm term type
// rxCui, TTY
const rxNormTty: Map<string, string> = new Map();

// rxNorm synonyms
// rxCui, Term
const rxNormSynonyms: MultiMap<string, string> = new MultiMap();

// data structures to store FHIR resources
// FHIR ID, Resource
const medications: Map<string, Medication> = new Map();
const medicationKnowledgeMap: Map<string, MedicationKnowledge> = new Map();
const substances: Map<string, Substance> = new Map();

// data structures to store RxNorm units of measure
const unitsOfMeasure: Set<string> = new Set();

function logStart(jobName: string): void {
  startTime = Date.now();
  console.log('Starting ' + jobName);
}

function logStop(): void {
  const elapsed = Date.now() - startTime;
  console.log('Elapsed time: ' + elapsed + ' ms');
}

async function readRxNormConceptsFile(): Promise<boolean> {
  logStart('Reading RxNorm concepts file');

  const inStream = createReadStream('MRCONSO.RRF');
  const rl = createInterface(inStream);

  for await (const line of rl) {
    const tokens = line.split('|');

    /* 0	RXCUI
     * 1	LAT
     * 2	TS
     * 3	LUI
     * 4	STT
     * 5	SUI
     * 6	ISPREF
     * 7	RXAUI
     * 8	SAUI
     * 9	SCUI
     * 10	SDUI
     * 11	SAB
     * 12	TTY
     * 13	CODE
     * 14	STR
     * 15	SRL
     * 16	SUPPRESS
     * 17	CVF
     */

    // only consider non-suppressed RxNorm concepts
    if (tokens[11] == 'RXNORM' && (tokens[16] == 'N' || tokens[16] == '')) {
      switch (tokens[12]) {
        case 'DF':
        case 'DFG': // RXCUI, STR
          doseForms.set(tokens[0], {
            coding: [
              {
                system: RXNORM_SYSTEM,
                code: tokens[0],
                display: tokens[14],
              },
            ],
          });
          break;
        case 'IN': // RXCUI, STR
          ingredients.set(tokens[0], {
            coding: [
              {
                system: RXNORM_SYSTEM,
                code: tokens[0],
                display: tokens[14],
              },
            ],
          });
          break;
        case 'BN': // RXCUI, STR
          brandNames.set(tokens[0], {
            coding: [
              {
                system: RXNORM_SYSTEM,
                code: tokens[0],
                display: tokens[14],
              },
            ],
          });
          break;
        case 'SCD':
        case 'SBD':
        case 'SCDF':
        case 'SBDF':
        case 'SCDC':
        case 'SBDC': // RXCUI, STR
          rxNormConcepts.set(tokens[0], {
            coding: [
              {
                system: RXNORM_SYSTEM,
                code: tokens[0],
                display: tokens[14],
              },
            ],
          });
          rxNormTty.set(tokens[0], tokens[12]);
          break;
        case 'PIN': // RXCUI, STR
          preciseIngredients.set(tokens[0], {
            coding: [
              {
                system: RXNORM_SYSTEM,
                code: tokens[0],
                display: tokens[14],
              },
            ],
          });
          break;
      }
    }

    // only consider non-suppressed synonyms and exclude DrugBank terms
    if (tokens[16] == 'N' || tokens[16] == '') {
      if (tokens[11] != 'DRUGBANK') {
        switch (tokens[12]) {
          case 'SY':
          case 'PSN':
          case 'PT': // RXCUI, STR
            rxNormSynonyms.set(tokens[0], tokens[14]);
            break;
        }
      }
    }
  }

  // cpcRxnConso.close()
  inStream.close();
  logStop();
  return true;
}

async function readRxNormRelationshipsFile(): Promise<boolean> {
  logStart('Reading RxNorm relationships file');

  const inStream = createReadStream('MRREL.RRF');
  const rl = createInterface(inStream);

  for await (const line of rl) {
    const tokens = line.split('|');

    /* 0	RXCUI1
     * 1	RXAUI1
     * 2	STYPE1
     * 3	REL
     * 4	RXCUI2
     * 5	RXAUI2
     * 6	STYPE2
     * 7	RELA
     * 8	RUI
     * 9	SRUI
     * 10	SAB
     * 11	SL
     * 12	DIR
     * 13	RG
     * 14	SUPPRESS
     * 15	CVF
     */

    // only consider non-suppressed RxNorm relationships
    if (tokens[10] == 'RXNORM' && (tokens[14] == 'N' || tokens[14] == '')) {
      switch (tokens[7]) {
        case 'has_ingredient':
          hasIngredient.set(tokens[4], tokens[0]);
          break;
        case 'consists_of':
          consistsOf.set(tokens[4], tokens[0]);
          break;
        case 'has_dose_form':
          hasDoseForm.set(tokens[4], tokens[0]);
          break;
        case 'has_doseformgroup':
          hasDoseFormGroup.set(tokens[4], tokens[0]);
          break;
        case 'contains':
          contains.set(tokens[4], tokens[0]);
          break;
        case 'isa':
          isa.set(tokens[4], tokens[0]);
          break;
        case 'has_form':
          hasForm.set(tokens[4], tokens[0]);
          break;
        case 'tradename_of':
          tradeNameOf.set(tokens[4], tokens[0]);
          break;
      }
    }
  }

  inStream.close();
  logStop();
  return true;
}

async function readRxNormAttributesFile(): Promise<boolean> {
  logStart('Reading RxNorm attributes file');

  const inStream = createReadStream('MRSAT.RRF');
  const rl = createInterface(inStream);

  for await (const line of rl) {
    const tokens = line.split('|');

    /* 0	RXCUI
     * 1	LUI
     * 2	SUI
     * 3	RXAUI
     * 4	STYPE
     * 5	CODE
     * 6	ATUI
     * 7	SATUI
     * 8	ATN
     * 9	SAB
     * 10	ATV
     * 11	SUPPRESS
     * 12	CVF
     */

    const attribName = tokens[8];

    // only consider non-suppressed RxNorm attributes
    if (tokens[9] == 'RXNORM' && (tokens[11] == 'N' || tokens[11] == '')) {
      switch (attribName) {
        // New basis of strength attributes since September 2018 release
        // https://www.nlm.nih.gov/pubs/techbull/so18/brief/so18_rxnorm_boss.html
        case 'RXN_BOSS_STRENGTH_NUM_VALUE':
        case 'RXN_BOSS_STRENGTH_NUM_UNIT':
        case 'RXN_BOSS_STRENGTH_DENOM_VALUE':
        case 'RXN_BOSS_STRENGTH_DENOM_UNIT': // RXCUI, ATN, ATV
          attributes.set(tokens[0], attribName, tokens[10]);
          break;
        case 'RXN_STRENGTH': // RXCUI, ATN, ATV
          attributes.set(tokens[0], attribName, tokens[10]);
          break;
      }
    }
    return true;
  }

  inStream.close();
  logStop();
  return true;
}

function writeSubstanceResources(): boolean {
  logStart('Writing FHIR Substance resources');

  ingredients.forEach((concept, ing_rxCui) => {
    const substance: Substance = {
      resourceType: 'Substance',
      status: 'active',
      code: concept,
    };

    const synonyms = rxNormSynonyms.get(ing_rxCui);

    const synonymUrl = FHIR_SERVER_URL + 'StructureDefinition/synonym';

    // Flatten RxNorm hierarchy by storing basis of strength substance (BoSS) as synonyms
    // exceptions should apply for clinically significant salts
    const preciseIngredientIds = hasForm.get(ing_rxCui);

    preciseIngredientIds?.forEach((preciseIng_rxCui) => {
      const preciseIngredient = preciseIngredients.get(preciseIng_rxCui);
      if (preciseIngredient) {
        synonyms.push(preciseIngredient?.coding?.[0]?.display as string);
      }
      synonyms.push(...(rxNormSynonyms.get(preciseIng_rxCui) as string[]));
    });

    const uniqueSynonyms = new Set(synonyms);
    uniqueSynonyms.forEach((synonym) => {
      if (concept?.coding?.[0]?.display?.toLowerCase() !== synonym.toLowerCase()) {
        const synonymExtension: Extension = {
          url: synonymUrl,
          valueString: synonym,
        };
        substance.extension = [...(substance.extension || []), synonymExtension];
      }
    });

    const substanceId = `rxNorm-${ing_rxCui}`; // use rxNorm-<rxCui> as resource ID
    substance.id = substanceId;
    substances.set(substanceId, substance);
  });

  logStop();
  return true;
}

function getAmount(scdcAttributes: Map<string, string>): Ratio | undefined {
  if (!scdcAttributes) {
    return undefined;
  }

  if (
    scdcAttributes.get('RXN_BOSS_STRENGTH_DENOM_UNIT') &&
    scdcAttributes.get('RXN_BOSS_STRENGTH_DENOM_VALUE') &&
    scdcAttributes.get('RXN_BOSS_STRENGTH_NUM_UNIT') &&
    scdcAttributes.get('RXN_BOSS_STRENGTH_NUM_VALUE')
  ) {
    return {
      numerator: {
        value: parseFloat(scdcAttributes.get('RXN_BOSS_STRENGTH_NUM_VALUE') as string),
        unit: scdcAttributes.get('RXN_BOSS_STRENGTH_NUM_UNIT') as string,
      },
      denominator: {
        value: parseFloat(scdcAttributes.get('RXN_BOSS_STRENGTH_DENOM_VALUE') as string),
        unit: scdcAttributes.get('RXN_BOSS_STRENGTH_DENOM_UNIT') as string,
      },
    };
  }

  if (scdcAttributes.get('RXN_STRENGTH')) {
    const strength = scdcAttributes.get('RXN_STRENGTH') as string;
    const strengthParts = strength.split(' ');
    const numeratorValue = parseFloat(strengthParts[0]);
    const unitDenominator = strengthParts[1].split('/');
    const numeratorUnit = unitDenominator[0];
    unitsOfMeasure.add(numeratorUnit);

    if (unitDenominator.length === 2) {
      const denominatorUnit = unitDenominator[1];
      const denominatorValue = 1;
      unitsOfMeasure.add(denominatorUnit);
      return {
        numerator: { value: numeratorValue, unit: numeratorUnit },
        denominator: { value: denominatorValue, unit: denominatorUnit },
      };
    } else {
      const denominatorUnit = '1';
      const denominatorValue = 1;
      return {
        numerator: { value: numeratorValue, unit: numeratorUnit },
        denominator: { value: denominatorValue, unit: denominatorUnit },
      };
    }
  }

  return undefined;
}

function getIngredientComponent(
  scdc_rxCui: string,
  forMedicationKnowledge: boolean
): (MedicationKnowledgeIngredient | MedicationIngredient)[] | undefined {
  const ing_rxCuis = hasIngredient.get(scdc_rxCui);

  return ing_rxCuis
    ?.map((ing_rxCui: string) => {
      const ingredient = ingredients.get(ing_rxCui);
      if (!ingredient) {
        return undefined;
      }

      const substanceId = `rxNorm-${ing_rxCui}`; // use rxNorm-<rxCui> as resource ID

      const substance = substances.get(substanceId) as Substance;

      if (forMedicationKnowledge) {
        return {
          item: createReference(substance),
          strength: getAmount(attributes.get(scdc_rxCui)),
          active: true,
        } as MedicationKnowledgeIngredient;
      }

      return {
        item: createReference(substance),
        strength: getAmount(attributes.get(scdc_rxCui)),
        active: true,
      } as MedicationIngredient;
    })
    .filter((e) => !!e) as (MedicationKnowledgeIngredient | MedicationIngredient)[];
}

function setIngredientComponent(rxCui: string, med: Medication, medKnowledge: MedicationKnowledge): void {
  const medIngredientComponents = getIngredientComponent(rxCui, false) as MedicationIngredient[];
  if (medIngredientComponents) {
    for (const component of medIngredientComponents) {
      if (!med.ingredient) {
        med.ingredient = [];
      }
      med.ingredient.push(component);
    }
  }

  const medKnowledgeIngredientComponents = getIngredientComponent(rxCui, true) as MedicationKnowledgeIngredient[];
  if (medKnowledgeIngredientComponents) {
    for (const component of medKnowledgeIngredientComponents) {
      if (!medKnowledge.ingredient) {
        medKnowledge.ingredient = [];
      }
      medKnowledge.ingredient.push(component);
    }
  }
}

function writeMedicationResources(): void {
  logStart('Writing FHIR Medication resources');

  for (const rxCui of rxNormConcepts.keys()) {
    const med: Medication = { resourceType: 'Medication' };
    const medKnowledge: MedicationKnowledge = { resourceType: 'MedicationKnowledge' };
    const tty = rxNormTty.get(rxCui);

    switch (tty) {
      case 'SBD':
      case 'SBDC':
      case 'SBDF':
      case 'SBDG':
        if (!med.extension) {
          med.extension = [];
        }
        med.extension.push({
          url: `${FHIR_SERVER_URL}StructureDefinition/brand`,
          valueString: brandNames.get(hasIngredient.get(rxCui)[0])?.coding?.[0]?.display as string,
        });
        break;
    }

    switch (tty) {
      case 'SBD':
      case 'SCD':
        for (const drugComponent_rxCui of consistsOf.get(rxCui)) {
          setIngredientComponent(drugComponent_rxCui, med, medKnowledge);
        }
        break;
      case 'SCDC':
      case 'SCDF':
      case 'SCDG':
      case 'SBDG':
        setIngredientComponent(rxCui, med, medKnowledge);
        break;
      case 'SBDC':
      case 'SBDF':
        for (const generic_rxCui of tradeNameOf.get(rxCui)) {
          setIngredientComponent(generic_rxCui, med, medKnowledge);
        }
        break;
      case 'BPCK':
      case 'GPCK':
        for (const clinicalDrug_rxCui of contains.get(rxCui)) {
          for (const drugComponent_rxCui of consistsOf.get(clinicalDrug_rxCui)) {
            setIngredientComponent(drugComponent_rxCui, med, medKnowledge);
          }
        }
        break;
    }

    med.status = 'active';

    const doseFormId = hasDoseForm.get(rxCui) || hasDoseFormGroup.get(rxCui);

    if (doseFormId) {
      med.form = doseForms.get(doseFormId);
      medKnowledge.doseForm = doseForms.get(doseFormId);
    }

    med.code = rxNormConcepts.get(rxCui);

    const medId = `rxNorm-${rxCui}`; // use rxNorm-<rxCui> as resource ID
    med.id = medId;
    medications.set(medId, med);

    // store associated parent concepts (SCDF/SBDF/SCDC/SBDC) in MedicationKnowledge
    // only if the parent concepts are extracted
    const parentIds: string[] = isa.get(rxCui).filter((it) => rxNormConcepts.has(it));

    parentIds.push(...consistsOf.get(rxCui).filter((it) => rxNormConcepts.has(it)));

    if (parentIds.length > 0) {
      medKnowledge.associatedMedication = parentIds.map((it) => ({
        reference: `Medication/rxNorm-${it}`,
      }));
    }

    const synonyms = new Set(rxNormSynonyms.get(rxCui));

    if (synonyms.size > 0) {
      // medKnowledge.setSynonym(synonyms) // load RxNorm synonyms into MedicationKnowledge
      medKnowledge.synonym = Array.from(synonyms);
    }

    medKnowledge.status = 'active';
    medKnowledge.code = rxNormConcepts.get(rxCui);

    medKnowledge.id = medId;
    medicationKnowledgeMap.set(medId, medKnowledge);
  }

  logStop();
}

function toBundle<T extends Resource>(map: Map<string, T>): Bundle<T> {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: Array.from(map.values()).map((resource) => ({
      resource,
    })),
  };
}

async function main(): Promise<void> {
  await readRxNormConceptsFile();
  await readRxNormRelationshipsFile();
  await readRxNormAttributesFile();
  writeSubstanceResources();
  writeMedicationResources();
  writeFileSync('./output/RxNorm-Substance.json', JSON.stringify(toBundle(substances), null, 2));
  writeFileSync('./output/RxNorm-Medication.json', JSON.stringify(toBundle(medications), null, 2));
  writeFileSync('./output/RxNorm-MedicationKnowledge.json', JSON.stringify(toBundle(medicationKnowledgeMap), null, 2));
  console.log('Units of measure detected: ', unitsOfMeasure);
}

if (require.main === module) {
  main()
    .then(() => console.log('Done'))
    .catch(console.error);
}
