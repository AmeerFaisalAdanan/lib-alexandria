'use client';

import { useLibraryStore } from '../../store/useLibraryStore';
import { dictionaries } from '../../i18n/translations';
import { Globe, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const language = useLibraryStore((state) => state.language);
  const setLanguage = useLibraryStore((state) => state.setLanguage);
  const resetDemoData = useLibraryStore((state) => state.resetDemoData);
  const dict = dictionaries[language].settings;

  return (
    <main class="flex-1 p-4 md:p-8 space-y-6 max-w-3xl w-full mx-auto">
      <div class="border-b border-slate-800/80 pb-5">
        <h1 class="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{dict.title}</h1>
        <p class="text-xs md:text-sm text-slate-400 mt-1">Application preferences and demo state management</p>
      </div>

      <div class="space-y-6">
        <!-- LANGUAGE SWITCHER -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-base font-bold text-white">{dict.languageSelect}</h3>
              <p class="text-xs text-slate-400">{dict.languageDesc}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => setLanguage('en')}
              class={`py-3 px-4 rounded-xl border font-bold text-sm transition flex items-center justify-between touch-target ${
                language === 'en'
                  ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>English</span>
              {language === 'en' && <span>✓</span>}
            </button>

            <button
              onClick={() => setLanguage('ms')}
              class={`py-3 px-4 rounded-xl border font-bold text-sm transition flex items-center justify-between touch-target ${
                language === 'ms'
                  ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>Bahasa Melayu</span>
              {language === 'ms' && <span>✓</span>}
            </button>
          </div>
        </div>

        <!-- DEMO DATA RESET -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-base font-bold text-white">{dict.demoResetTitle}</h3>
              <p class="text-xs text-slate-400">{dict.demoResetDesc}</p>
            </div>
          </div>

          <div class="pt-2">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to reset all data to default demo state?')) {
                  resetDemoData();
                }
              }}
              class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold px-5 py-3 rounded-xl text-xs md:text-sm transition touch-target"
            >
              {dict.resetBtn}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
