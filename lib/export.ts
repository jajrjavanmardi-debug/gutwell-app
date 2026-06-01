import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

/**
 * Export all user data as CSV and open the share sheet.
 */
export async function exportUserData(userId: string) {
  // Fetch all data
  const [checkIns, foodLogs, symptoms] = await Promise.all([
    supabase.from('check_ins').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('food_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }),
    supabase.from('symptoms').select('*').eq('user_id', userId).order('logged_at', { ascending: false }),
  ]);

  let csv = 'GutWell Data Export\n\n';

  // Check-ins
  csv += '=== CHECK-INS ===\n';
  csv += 'Date,Stool Type,Bloating,Pain,Energy,Mood,Water Intake,Note\n';
  (checkIns.data || []).forEach(c => {
    csv += `${c.entry_date},${c.stool_type},${c.bloating || ''},${c.pain || ''},${c.energy || ''},${c.mood || ''},${c.water_intake || 0},"${(c.note || '').replace(/"/g, '""')}"\n`;
  });

  // Food logs
  csv += '\n=== FOOD LOGS ===\n';
  csv += 'Date,Meal Type,Meal Name,Note\n';
  (foodLogs.data || []).forEach(f => {
    csv += `${f.logged_at?.split('T')[0] || ''},${f.meal_type || ''},"${(f.meal_name || '').replace(/"/g, '""')}","${(f.note || '').replace(/"/g, '""')}"\n`;
  });

  // Symptoms
  csv += '\n=== SYMPTOMS ===\n';
  csv += 'Date,Symptom,Severity,Note\n';
  (symptoms.data || []).forEach(s => {
    csv += `${s.logged_at?.split('T')[0] || ''},${s.symptom_type},${s.severity},"${(s.note || '').replace(/"/g, '""')}"\n`;
  });

  // Write to temp file
  const fileName = `gutwell-export-${new Date().toISOString().split('T')[0]}.csv`;
  const filePath = `${cacheDirectory}${fileName}`;
  await writeAsStringAsync(filePath, csv, { encoding: 'utf8' });

  // Share
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'text/csv',
      dialogTitle: 'Export GutWell Data',
      UTI: 'public.comma-separated-values-text',
    });
  }
}
