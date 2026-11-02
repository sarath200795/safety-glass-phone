/* Safety Glass hazard library. Sources: HSE (hse.gov.uk) pages verified reachable Oct 2026.
   Defect checklists for fire/emergency equipment are general good practice informed by HSE guidance;
   UK/BS references are not Indian law – cross-check with NBC 2016 Part 4, IS 2190, Factories Act & state rules. */
(function () {
  const U = 'https://www.hse.gov.uk/';
  const S = {
    slips: U + 'slips/', wah: U + 'work-at-height/', ladders: U + 'work-at-height/ladders/index.htm',
    elec: U + 'electricity/', pat: U + 'electricity/faq-portable-appliance-testing.htm',
    mach: U + 'work-equipment-machinery/', puwer: U + 'work-equipment-machinery/puwer.htm',
    mh: U + 'msd/manual-handling/', msd: U + 'msd/', coshh: U + 'coshh/', coshhb: U + 'coshh/basics/index.htm',
    ghs: U + 'chemical-classification/labelling-packaging/hazard-symbols-hazard-pictograms.htm',
    clp: U + 'chemical-classification/', fire: U + 'fireandexplosion/fire-safety.htm',
    fireq: U + 'construction/faq-fire.htm', genfire: U + 'construction/safetytopics/generalfire.htm',
    dsear: U + 'fireandexplosion/dsear.htm', wt: U + 'workplacetransport/', ppe: U + 'ppe/',
    cs: U + 'confinedspace/', noise: U + 'noise/', vib: U + 'vibration/', asb: U + 'asbestos/',
    gas: U + 'gas/', weld: U + 'welding/', fa: U + 'firstaid/', faq: U + 'firstaid/faqs.htm',
    welfare: U + 'pubns/indg244.htm'
  };
  const H = (id, name, severity, cues, control, source, defects) =>
    Object.assign({ id, name, severity, cues, control, source }, defects ? { defects } : {});

  const categories = [
    { id: 'slips', name: 'Slips & trips / housekeeping', hazards: [
      H('wet_floor', 'Wet or contaminated floor', 'MEDIUM', ['shiny/reflective puddles', 'oil or liquid spill', 'no wet-floor sign'], 'Clean spill immediately, place warning sign, fix leak source', S.slips),
      H('trailing_cable', 'Trailing cables / hoses across walkway', 'MEDIUM', ['cables across floor', 'extension leads on walkway'], 'Re-route, use cable covers or overhead routing', S.slips),
      H('obstructed_walkway', 'Obstructed walkway / poor housekeeping', 'MEDIUM', ['boxes, pallets, tools on floor', 'cluttered aisles'], 'Clear and keep walkways marked and free', S.slips),
      H('damaged_floor', 'Damaged/uneven floor, holes, loose mats', 'MEDIUM', ['potholes', 'raised edges', 'curled mats', 'unmarked steps'], 'Repair, mark edges with contrast tape', S.slips)]},
    { id: 'height', name: 'Work at height', hazards: [
      H('unprotected_edge', 'Unprotected edge / opening', 'HIGH', ['roof or platform edge without guardrail', 'open floor hole/pit', 'missing toe board'], 'Install guardrails/covers; fall arrest if unavoidable', S.wah),
      H('ladder_misuse', 'Unsafe ladder use', 'HIGH', ['ladder on uneven ground', 'not footed/tied', 'overreaching', 'damaged rungs/feet', 'standing on top rungs'], 'Use correct, inspected ladder; 3 points of contact; consider platform', S.ladders),
      H('no_harness', 'Person at height without fall protection', 'HIGH', ['worker on scaffold/roof without harness', 'harness not clipped'], 'Stop work; provide collective protection or anchored harness', S.wah),
      H('scaffold_defect', 'Defective scaffold / mobile tower', 'HIGH', ['missing boards or rails', 'no base plates', 'unlocked castors', 'missing scaff tag'], 'Inspect & tag; competent person to rectify', S.wah),
      H('falling_objects', 'Falling objects from height', 'HIGH', ['loose items on edges/shelves', 'no toe boards or netting'], 'Secure items, toe boards, exclusion zone below', S.wah)]},
    { id: 'electrical', name: 'Electrical', hazards: [
      H('exposed_live', 'Exposed conductors / open panel', 'HIGH', ['open DB/panel door', 'bare wires', 'missing covers'], 'Isolate, close/cover, LOTO, competent electrician', S.elec),
      H('damaged_cable', 'Damaged cable / plug', 'HIGH', ['cut or taped insulation', 'exposed inner cores', 'burnt plug'], 'Remove from service, repair/replace, inspect & test', S.pat),
      H('overloaded_socket', 'Overloaded sockets / daisy-chained adaptors', 'MEDIUM', ['multiple adaptors stacked', 'extension into extension'], 'Reduce load, provide adequate fixed sockets', S.elec),
      H('electrical_wet', 'Electrical equipment near water', 'HIGH', ['equipment or leads in puddles', 'outdoor use without RCD'], 'Remove, use RCD and suitably rated equipment', S.elec),
      H('overhead_lines', 'Overhead power lines near plant', 'HIGH', ['crane/tipper/ladder near overhead cables'], 'Exclusion zone, goal posts, isolation by DNO', S.elec)]},
    { id: 'machinery', name: 'Machinery & work equipment', hazards: [
      H('missing_guard', 'Missing / removed machine guard', 'HIGH', ['exposed belts, gears, blades, chucks', 'guard open or removed', 'interlock bypassed'], 'Stop machine, refit guard, check interlocks', S.mach),
      H('no_estop', 'Emergency stop missing/obstructed', 'HIGH', ['no red mushroom e-stop visible', 'e-stop blocked'], 'Provide accessible tested e-stop', S.puwer),
      H('entanglement', 'Entanglement risk (loose clothing/hair near rotating parts)', 'HIGH', ['loose sleeves, gloves, hair near lathe/drill'], 'Tie back hair, close-fitting clothing, no gloves on rotating tools', S.mach),
      H('no_loto', 'Maintenance without isolation (LOTO)', 'HIGH', ['work inside machine without lock/tag'], 'Isolate, lock-out tag-out, prove dead', S.puwer)]},
    { id: 'manual', name: 'Manual handling & ergonomics', hazards: [
      H('heavy_lift', 'Heavy / awkward lift', 'MEDIUM', ['person lifting large load', 'bent back, twisting', 'load above shoulder'], 'Use mechanical aid, team lift, TILE assessment', S.mh),
      H('high_stack', 'Unstable / high stacking', 'MEDIUM', ['leaning stacks', 'heavy items on top shelves', 'overloaded racking'], 'Restack, heavy items low, rack load signs', S.msd),
      H('poor_posture', 'Poor workstation posture / repetitive task', 'LOW', ['hunched over screen', 'repetitive reaching'], 'Adjust workstation, rotate tasks', S.msd)]},
    { id: 'chemical', name: 'Chemicals (COSHH / CLP)', hazards: [
      H('unlabelled_container', 'Unlabelled / decanted chemical container', 'HIGH', ['bottle/drum without label', 'chemical in drinks bottle'], 'Label with CLP/GHS info, keep SDS available', S.coshh),
      H('chemical_spill', 'Chemical spill / leaking drum', 'HIGH', ['stained floor near drums', 'leaking container', 'no bund'], 'Contain with spill kit, bund storage, PPE', S.coshhb),
      H('open_container', 'Open chemical container / fumes', 'MEDIUM', ['lids off', 'visible vapour'], 'Close lids, LEV, minimise quantity', S.coshh),
      H('incompatible_storage', 'Incompatible storage (e.g. oxidisers with flammables)', 'HIGH', ['GHS03 & GHS02 together', 'acids beside alkalis'], 'Segregate per SDS section 7', S.coshhb),
      H('gas_cylinder', 'Unsecured gas cylinder', 'HIGH', ['cylinder not chained', 'lying flat', 'no valve cap'], 'Chain upright, cap, ventilated store', S.gas),
      H('dust_fume', 'Dust / welding fume without control', 'MEDIUM', ['visible dust cloud', 'welding without extraction'], 'LEV, RPE, wet methods', S.weld),
      H('asbestos_suspect', 'Suspect asbestos material (damaged)', 'HIGH', ['damaged old cement sheet, lagging, ceiling tiles'], 'Do not disturb; survey and licensed contractor', S.asb)]},
    { id: 'fire_hazard', name: 'Fire & explosion hazards', hazards: [
      H('ignition_flammable', 'Ignition source near flammables', 'HIGH', ['smoking/open flame near fuels', 'hot work near combustibles', 'heater near paper'], 'Separate ignition and fuel; hot work permit', S.fire),
      H('combustible_waste', 'Accumulated combustible waste', 'MEDIUM', ['piles of cardboard, rags, rubbish'], 'Remove regularly, metal lidded bins', S.fire),
      H('flammable_storage', 'Flammable liquids stored improperly', 'HIGH', ['solvent cans outside flammable cabinet', 'large quantities in work area'], 'Approved cabinet/store, minimum quantities', S.dsear),
      H('explosive_atmosphere', 'Potential explosive atmosphere', 'HIGH', ['dust layers', 'vapour', 'non-Ex equipment in zone'], 'DSEAR/ATEX zoning, Ex-rated equipment', S.dsear)]},
    { id: 'transport', name: 'Workplace transport', hazards: [
      H('pedestrian_vehicle', 'Pedestrians mixing with vehicles/forklifts', 'HIGH', ['person close to moving forklift', 'no segregated walkway', 'reversing vehicle without banksman'], 'Segregate routes, barriers, banksman, visibility aids', S.wt),
      H('forklift_unsafe', 'Unsafe forklift operation', 'HIGH', ['raised load while travelling', 'passenger on forks', 'no seatbelt', 'overloaded'], 'Trained operator, lower forks, rated capacity', S.wt),
      H('loading_bay', 'Loading bay edge / vehicle creep', 'HIGH', ['open dock edge', 'trailer without wheel chocks'], 'Chocks/dock locks, edge protection', S.wt)]},
    { id: 'ppe', name: 'PPE', hazards: [
      H('no_helmet', 'No safety helmet where required', 'MEDIUM', ['bare head on site/under loads'], 'Enforce helmet zones', S.ppe),
      H('no_hivis', 'No high-visibility clothing near vehicles', 'MEDIUM', ['dark clothing in vehicle area'], 'Provide and enforce hi-vis', S.ppe),
      H('no_eye_protection', 'No eye/face protection (grinding, chemicals, welding)', 'MEDIUM', ['grinding without goggles', 'welding without shield'], 'Provide correct eye/face protection', S.ppe),
      H('no_gloves_footwear', 'No gloves/safety footwear where needed', 'LOW', ['handling sharp/chemical items bare-handed', 'sandals on shopfloor'], 'Task-appropriate gloves and safety shoes', S.ppe),
      H('no_hearing_protection', 'No hearing protection in noisy area', 'MEDIUM', ['loud machinery, no ear defenders'], 'Hearing protection zones, reduce noise at source', S.noise)]},
    { id: 'confined', name: 'Confined spaces', hazards: [
      H('confined_entry', 'Confined space entry without controls', 'HIGH', ['open manhole/tank with person inside', 'no attendant, no gas monitor, no tripod'], 'Permit to work, gas test, attendant, rescue plan', S.cs),
      H('open_manhole', 'Open manhole / pit unguarded', 'HIGH', ['uncovered hole', 'no barrier'], 'Cover or barricade', S.cs)]},
    { id: 'health', name: 'Noise, vibration & welfare', hazards: [
      H('noise', 'High noise exposure', 'MEDIUM', ['hammering, grinders, compressors', 'shouting to be heard at 2 m'], 'Noise assessment, controls, hearing protection', S.noise),
      H('vibration', 'Hand-arm vibration tools', 'LOW', ['prolonged breaker/grinder use'], 'Low-vibration tools, limit exposure', S.vib),
      H('poor_lighting', 'Poor lighting / welfare', 'LOW', ['dark area, stairs poorly lit'], 'Provide adequate lighting', S.welfare)]}
  ];

  const ghs = [
    { code: 'GHS01', name: 'Exploding bomb', meaning: 'Explosives, self-reactives, organic peroxides', visual: 'Red diamond, black bomb exploding' },
    { code: 'GHS02', name: 'Flame', meaning: 'Flammable gases, liquids, solids, aerosols; self-heating; pyrophoric', visual: 'Red diamond, black flame' },
    { code: 'GHS03', name: 'Flame over circle', meaning: 'Oxidisers – may cause or intensify fire', visual: 'Red diamond, flame above a circle (letter O)' },
    { code: 'GHS04', name: 'Gas cylinder', meaning: 'Gases under pressure (may explode if heated; cryogenic burns)', visual: 'Red diamond, horizontal gas cylinder' },
    { code: 'GHS05', name: 'Corrosion', meaning: 'Corrosive to metals; skin corrosion; serious eye damage', visual: 'Red diamond, liquids dripping onto hand and metal bar' },
    { code: 'GHS06', name: 'Skull and crossbones', meaning: 'Acute toxicity (fatal/toxic)', visual: 'Red diamond, skull and crossbones' },
    { code: 'GHS07', name: 'Exclamation mark', meaning: 'Harmful, irritant, skin sensitiser, narcotic effects, ozone hazard', visual: 'Red diamond, black exclamation mark' },
    { code: 'GHS08', name: 'Health hazard', meaning: 'Carcinogen, mutagen, reproductive toxicity, respiratory sensitiser, target organ, aspiration', visual: 'Red diamond, human torso with starburst on chest' },
    { code: 'GHS09', name: 'Environment', meaning: 'Hazardous to the aquatic environment', visual: 'Red diamond, dead tree and dead fish' }
  ].map((g) => Object.assign(g, { severity: ['GHS01', 'GHS02', 'GHS03', 'GHS05', 'GHS06', 'GHS08'].includes(g.code) ? 'HIGH' : 'MEDIUM', source: S.ghs }));

  const commonDefects = ['access obstructed', 'missing or unclear signage', 'inspection tag missing/expired', 'physically damaged'];
  const fireEquipment = [
    H('ext_water', 'Water extinguisher (red, white/red label band – Class A)', 'HIGH', ['red cylinder, red/white label', 'jet nozzle'], 'Wood/paper/textiles only; NOT electrical/liquid fires', S.fireq,
      ['missing safety pin or tamper seal', 'pressure gauge needle out of green', 'damaged/cracked hose or nozzle', 'not wall-mounted / on floor', ...commonDefects, 'corrosion/dents', 'wrong type for nearby risk']),
    H('ext_foam', 'Foam extinguisher (cream band – Class A/B)', 'HIGH', ['red cylinder with cream label', 'aspirating foam nozzle'], 'Flammable liquids & solids', S.fireq,
      ['missing safety pin or tamper seal', 'pressure gauge out of green', 'damaged hose/nozzle', 'not wall-mounted', ...commonDefects]),
    H('ext_powder', 'Dry powder extinguisher (blue band – A/B/C/electrical)', 'HIGH', ['red cylinder with blue label'], 'Liquids, gases, electrical; avoid enclosed spaces', S.fireq,
      ['missing safety pin or tamper seal', 'pressure gauge out of green', 'damaged hose/nozzle', 'caked powder (not inverted/serviced)', 'not wall-mounted', ...commonDefects]),
    H('ext_co2', 'CO2 extinguisher (black band – electrical/Class B)', 'HIGH', ['red cylinder with black label', 'black horn, no gauge'], 'Electrical and flammable liquid fires', S.fireq,
      ['missing safety pin or tamper seal', 'cracked/missing horn', 'no gauge expected – check weight/service tag', 'not wall-mounted', ...commonDefects]),
    H('ext_wetchem', 'Wet chemical extinguisher (yellow band – Class F)', 'HIGH', ['red cylinder with yellow label', 'long lance nozzle', 'kitchens'], 'Cooking oil/fat fires', S.fireq,
      ['missing safety pin or tamper seal', 'pressure gauge out of green', 'damaged lance', ...commonDefects]),
    H('hose_reel', 'Fire hose reel', 'HIGH', ['red drum reel with rubber hose in cabinet/wall'], 'Keep accessible, test periodically', S.genfire,
      ['hose cracked/kinked/leaking', 'nozzle missing or damaged', 'valve seized/no water', 'reel cabinet locked or blocked', 'hose not fully wound', ...commonDefects]),
    H('fire_blanket', 'Fire blanket', 'MEDIUM', ['red/white quick-release container, kitchen wall'], 'Small pan/clothing fires', S.fire,
      ['pull tapes missing/tangled', 'container damaged or open', 'blanket used/missing', ...commonDefects]),
    H('sprinkler', 'Sprinkler head', 'HIGH', ['ceiling head with glass bulb'], 'Keep 0.5 m clearance below heads', S.fire,
      ['painted/taped over', 'storage within clearance zone', 'bulb broken/missing', 'corroded or damaged head', 'head blocked by new partition']),
    H('fire_alarm', 'Fire alarm / manual call point / detector', 'HIGH', ['red break-glass call point', 'ceiling smoke/heat detector', 'sounder/beacon'], 'Test weekly, keep accessible', S.genfire,
      ['call point cover broken or missing', 'call point obstructed', 'detector covered (dust cap/bag) or painted', 'panel fault light/no power', 'sounder missing', ...commonDefects]),
    H('hydrant', 'Fire hydrant / landing valve', 'HIGH', ['red hydrant pillar, landing valve, hose box'], 'Keep 1 m clear, maintain, mark', S.genfire,
      ['access blocked by vehicles/materials', 'cap or wheel missing', 'leaking/corroded valve', 'hose box empty', 'signage missing', 'inspection tag expired']),
    H('fire_door', 'Fire door', 'HIGH', ['door with "Fire door keep shut" sign', 'self-closer', 'intumescent strips'], 'Keep shut, self-closing, undamaged', S.fire,
      ['wedged or propped open', 'self-closer broken/removed', 'damaged leaf or gaps', 'missing intumescent/smoke seals', 'signage missing', 'door blocked']),
    H('fire_exit', 'Fire exit / escape route & exit signage', 'HIGH', ['green running-man sign', 'exit door with push bar'], 'Keep routes clear, doors openable without key', S.fire,
      ['exit blocked or obstructed', 'exit locked/chained', 'exit sign missing/unlit/wrong direction', 'escape route used for storage', 'push-bar defective'])
  ];

  const emergencyEquipment = [
    H('emergency_light', 'Emergency lighting', 'MEDIUM', ['ceiling/wall luminaire with green charging LED'], 'Monthly function test, annual duration test', S.fire,
      ['charge LED off/red', 'unit damaged or missing diffuser', 'not lit during test', 'test record missing']),
    H('exit_sign', 'Illuminated exit sign', 'MEDIUM', ['green running-man luminaire'], 'Must be visible and lit', S.fire,
      ['unlit / failed', 'obscured by stock or fittings', 'wrong arrow direction', 'missing']),
    H('first_aid_kit', 'First aid kit', 'MEDIUM', ['green box with white cross'], 'Stock per needs assessment; check regularly', S.faq,
      ['empty or incomplete', 'expired items', 'not accessible/locked', 'no first-aider notice', 'dirty/damaged box', ...commonDefects]),
    H('eyewash', 'Eyewash station / bottles', 'HIGH', ['green sign with eye and water', 'wall bottles or plumbed bowl'], 'Near corrosives; flush test weekly', S.coshh,
      ['bottles expired/seal broken/empty', 'dust caps missing', 'no water flow', 'access blocked', 'signage missing']),
    H('safety_shower', 'Emergency safety shower', 'HIGH', ['overhead shower head with pull handle, green sign'], 'Test weekly, keep clear', S.coshh,
      ['pull handle missing/unreachable', 'no or low flow', 'area obstructed', 'no drain/standing water', 'signage missing', 'inspection tag expired']),
    H('aed', 'AED (defibrillator)', 'HIGH', ['green AED sign with heart & bolt', 'wall cabinet'], 'Check status indicator and pad expiry', S.faq,
      ['status indicator red/no OK light', 'pads expired or missing', 'cabinet locked/alarm faulty', 'access blocked', 'signage missing']),
    H('spill_kit', 'Spill kit', 'MEDIUM', ['yellow/blue bin or bag labelled spill kit'], 'Near chemical/oil storage, restock after use', S.coshhb,
      ['empty or incomplete', 'seal broken', 'wrong type for chemicals stored', 'access blocked', 'signage missing']),
    H('assembly_point', 'Assembly point sign', 'LOW', ['green sign with people/arrows "Assembly Point"'], 'Visible, safe distance from building', S.fire,
      ['sign missing/faded', 'obstructed by parked vehicles', 'located in vehicle route or too close to building']),
    H('first_aid_notice', 'First aider / emergency contact notice', 'LOW', ['notice with names and numbers'], 'Keep up to date', S.fa,
      ['missing', 'out of date names/numbers'])
  ];

  const lib = {
    version: '2026-10',
    disclaimer: 'Assistive tool only. Not a substitute for competent inspection or risk assessment. HSE guidance is UK; check Indian law/NBC/IS standards.',
    sources: S, categories, ghs, fireEquipment, emergencyEquipment
  };
  // Flat list for search/lookups
  lib.all = [].concat(
    ...categories.map((c) => c.hazards.map((h) => Object.assign({ category: c.name }, h))),
    ghs.map((g) => ({ id: g.code, name: g.code + ' ' + g.name, severity: g.severity, cues: [g.visual], control: g.meaning, source: g.source, category: 'GHS pictogram' })),
    fireEquipment.map((h) => Object.assign({ category: 'Fire-fighting equipment' }, h)),
    emergencyEquipment.map((h) => Object.assign({ category: 'Emergency equipment' }, h)));
  lib.byId = Object.fromEntries(lib.all.map((h) => [h.id, h]));
  lib.compact = function () {
    const L = [];
    categories.forEach((c) => L.push(c.name + ': ' + c.hazards.map((h) => `${h.id}(${h.severity[0]}) ${h.name} [${h.cues.join('; ')}]`).join(' | ')));
    L.push('GHS pictograms: ' + ghs.map((g) => `${g.code} ${g.name} = ${g.visual}`).join(' | '));
    L.push('Fire-fighting equipment (report defects): ' + fireEquipment.map((h) => `${h.id}: ${h.name}; defects: ${h.defects.join(', ')}`).join(' | '));
    L.push('Emergency equipment (report defects): ' + emergencyEquipment.map((h) => `${h.id}: ${h.name}; defects: ${h.defects.join(', ')}`).join(' | '));
    return L.join('\n');
  };
  window.HAZARD_LIBRARY = lib;
})();
