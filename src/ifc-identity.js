import { v5, validate } from 'uuid';

const legacyNamespace = v5('OpenAEC/Open Stair Studio/legacy IFC4 model', v5.URL);
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

export function ifcModelId(model) {
  const saved = model.bim?.modelId;
  if (saved != null) {
    if (!validate(saved)) throw new Error('Ongeldige identificatie van het BIM-model.');
    return saved;
  }
  // Two independent imports of the same archive must migrate to the same identity.
  // Persist this once so subsequent edits to project fields and geometry cannot change it.
  return v5(JSON.stringify([model.project, model.stair]), legacyNamespace);
}

export function compressedModelGuid(namespace, ...keys) {
  const uuid = v5(JSON.stringify(keys), namespace);
  let value = BigInt('0x' + uuid.replaceAll('-', ''));
  let result = '';
  for (let i = 0; i < 22; i++) {
    result = alphabet[Number(value & 63n)] + result;
    value >>= 6n;
  }
  return result;
}
