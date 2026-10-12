const done = { en: 'Journal updated.', fr: 'Carnet mis à jour.' };
export const MUTATIONS = {
  update_plant: 'update',
  move_plant: 'move',
  record_care: 'care',
  set_reminder: 'reminder',
  snooze_reminder: 'snooze',
  archive_plant: 'archive',
};
export const ACTION_KEYS = ['add_plant', ...Object.keys(MUTATIONS), 'refresh_weather', 'backup'];
export const SCENE_KEYS = ['move_plant', 'record_care', 'snooze_reminder', 'refresh_weather'];
export async function runAction(context, key, fields, { scene = false } = {}) {
  if (key === 'add_plant') {
    await context.journal.add(fields);
    return {
      en: 'Plant added. Open Discovery and add its device to use plant selectors.',
      fr: 'Plante ajoutée. Ouvrez Découverte et ajoutez son appareil pour la sélectionner dans les formulaires.',
    };
  }
  if (MUTATIONS[key]) {
    await context.journal[MUTATIONS[key]](fields, { emit: !scene });
    return scene ? { updated: true } : done;
  }
  if (key === 'refresh_weather') {
    const result = await context.weather.refresh(context.config);
    if (!context.config.weather_enabled) throw new Error('Météo désactivée / Weather disabled');
    if (result.failed)
      throw new Error(
        'Météo indisponible : vérifiez la clé API, la maison et le fournisseur / Check weather configuration',
      );
    return scene
      ? { updated: result.ok > 0 }
      : { en: 'Weather refreshed.', fr: 'Météo actualisée.' };
  }
  if (key === 'backup') {
    await context.store.backup();
    return {
      en: 'Backup written to /data/backups (last 10 kept).',
      fr: 'Sauvegarde écrite dans /data/backups (10 dernières conservées).',
    };
  }
  throw new Error('Unknown action');
}
