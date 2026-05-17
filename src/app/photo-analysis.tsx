import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  BorderRadius as ImportedBorderRadius,
  Colors as ImportedColors,
  FontFamily as ImportedFontFamily,
  FontSize as ImportedFontSize,
  Shadows as ImportedShadows,
  Spacing as ImportedSpacing,
} from '../../constants/theme';
import {
  parseRnVoiceError,
  teardownExpoSpeechRecognition,
  tryStartExpoSpeechRecognition,
} from '../../lib/meal-voice-session';
import { enqueue } from '../../lib/offline-queue';
import { canUseNativeSpeechToText } from '../../lib/runtime-environment';
import { analyzeMealPhoto, reviseMealAnalysis } from '../../lib/RecommendationEngine';
import {
  APP_LANGUAGE_STORAGE_KEY,
  isRtlLanguage as isAppRtlLanguage,
  parseStoredLanguage,
  type AppLanguage,
} from '../../lib/app-language';
import {
  applyDynamicMealImpactScore,
  extractMealName,
  getPhotoAnalysisHistory,
  resolveMealImpactScore,
  savePhotoAnalysisHistoryItem,
} from '../../lib/photo-analysis-history';
import { getRecentSupplements, type SupplementHistoryItem } from '../../lib/supplement-history';
import { supabase } from '../../lib/supabase';
import {
  addXpForAction,
  getUserProgressProfile,
  recordTriggerFeedback,
  type TriggerFeedbackItem,
} from '../../lib/user-progress';
import {
  getPromptConditions,
  getUserProfileSettings,
  type MedicalCondition,
} from '../../lib/user-profile-settings';

const Colors = ImportedColors ?? {
  background: '#000000',
  border: '#242424',
  primary: '#B2AC88',
  primaryLight: '#C7C1A0',
  secondary: '#B2AC88',
  secondaryLight: '#C7C1A0',
  surface: '#0B0B0B',
  text: '#FFFFFF',
  textInverse: '#FFFFFF',
  textSecondary: '#A7A7A7',
  textTertiary: '#777777',
};
const Spacing = ImportedSpacing ?? { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
const BorderRadius = ImportedBorderRadius ?? { md: 12, lg: 20, xl: 24, full: 999 };
const FontSize = ImportedFontSize ?? { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 };
const FontFamily = ImportedFontFamily ?? {
  displaySemiBold: 'System',
  sansRegular: 'System',
  sansMedium: 'System',
  sansSemiBold: 'System',
  sansBold: 'System',
};
const Shadows = ImportedShadows ?? {
  sm: {
    shadowColor: '#7E795D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  md: {
    shadowColor: '#7E795D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};

const createStyles = <T extends Parameters<typeof StyleSheet.create>[0]>(styleSheet: T) =>
  StyleSheet?.create ? StyleSheet.create(styleSheet) : styleSheet;

type WizardStep = 1 | 2 | 3;
/** When set to `Germany`, skips GPS and fixes AI context to Nürtingen (dev/testing only). */
const DEV_LOCATION_OVERRIDE =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DEV_LOCATION_OVERRIDE
    ? process.env.EXPO_PUBLIC_DEV_LOCATION_OVERRIDE.trim()
    : '';

const SYMPTOM_OPTIONS = [
  { key: 'bloating', promptLabel: 'Bloating', labels: { en: 'Bloating', de: 'Blähungen', fa: 'نفخ' } },
  { key: 'pain', promptLabel: 'Stomach pain', labels: { en: 'Pain', de: 'Schmerzen', fa: 'درد' } },
  { key: 'heaviness', promptLabel: 'Heaviness', labels: { en: 'Heaviness', de: 'Schweregefühl', fa: 'سنگینی' } },
  { key: 'gas', promptLabel: 'Gas', labels: { en: 'Gas', de: 'Gase', fa: 'گاز شکمی' } },
  { key: 'cramps', promptLabel: 'Cramps', labels: { en: 'Cramps', de: 'Krämpfe', fa: 'گرفتگی' } },
  { key: 'nausea', promptLabel: 'Nausea', labels: { en: 'Nausea', de: 'Übelkeit', fa: 'تهوع' } },
  { key: 'reflux', promptLabel: 'Reflux', labels: { en: 'Reflux', de: 'Reflux', fa: 'ریفلاکس' } },
  { key: 'diarrhea', promptLabel: 'Diarrhea', labels: { en: 'Diarrhea', de: 'Durchfall', fa: 'اسهال' } },
  { key: 'constipation', promptLabel: 'Constipation', labels: { en: 'Constipation', de: 'Verstopfung', fa: 'یبوست' } },
  { key: 'lowEnergy', promptLabel: 'Low energy', labels: { en: 'Low energy', de: 'Wenig Energie', fa: 'انرژی کم' } },
] as const;

type SymptomKey = (typeof SYMPTOM_OPTIONS)[number]['key'];
type DemoMealKey = 'salmonRiceBowl' | 'lentilSoup';

const DEMO_SALMON_RICE_BOWL_BASE64 =
  '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABaAHgDASIAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAAAAEDBAIFBgcI/8QAORAAAgICAAQEAgYHCQAAAAAAAQIAAwQRBRIhMQYTQVEicQcyQmGBkRQjM1JysfAkNENic5KhwfH/xAAaAQADAQEBAQAAAAAAAAAAAAAAAQMCBAUG/8QAJREAAwACAQMDBQEAAAAAAAAAAAECAxEEEiFBFFGhEyIxMkKR/9oADAMBAAIRAxEAPwC59Gn0acPxOFY/GuNYqZWbkqLKqbV2lKHqvwnuxHXr2npqIlahEVVUdgo0BBFWtFRBpVAAHsBMgN9pJvZoUI9Adz+UNr7H84AKKPa+xER1rYMBBCIsBFzCIQ4RcwhuAhxQhAAidEsUq6qynuGGwY4oCPM/pJ+jbh+XwrI4zwbFTFzcZTZbTSukuQdW+EdmA69O8J6U6LYjIw2rAgj3BhNKg2TQhFMlAhCYkkkKOpPaAh7JOlGzMiiVjmufXsoj/ZaqqAa1h1J7CSV0Kh5j8TnuxmtAYKzH9ljaHu/SZbyf3KvzMmhHoCuzN/i42x7odzEVpYOal96+yZakdlCueYfC47MItB2KuyDphoj0huSkeduq0BbVHQjsZBshirdCO8RlrRlCEURkIQhARJCEUCoMdCOoiup72G/RRIrW0JOV+Kir0HxH8IxIgy86nhOJ5+RtrLD9Ud2Pt8pqqPF6tcBfi8lZP1lfZH4ai8X1Owx7Rsom1b7ida/lOYkMmSprSObLkpVpHorZtK1C3mUVkbDltDUo2+JeHVHXnc/8CkzkAbslEWyxjXWOVAT0A+6SCmsfZ385N8ivB72LhS5Tt9zqq/E/DHOjY6feyHU2dGRTk1h6bVsU+qnc4M1Vn7Ajovv4dcL8ZyB9pT2PzhPIr+h3wYa+x9zp+I8RcZHl0gDyj9b13Mac1sk/rABYo6keolbyn4gq5eMvOt3Urvqp9RLnD8F62u84afy9Bfn/AOTjxVyq5PffT8aObJONY9efnZODsRyOo7EknrHnBCKEAJIQhA2QXGXT/fF/0z/OUb+xlvn2ce70I5T+MaGhWKtjMrqGU7BBGwZzfiPBxsSmhsfHSvnc8xX5TqbUO+Zfxmt4vTj5WA1V9yUnujudAMJLJO00Xw1M5JqvwjlqteUuvaZSslhpYodMAfQ7/KTC6s+uvnOA9h8jDv8Adf6jOJtch321MTdWPtb+UwQXZtoox6yxPoP+/YQLLTW/A6PE1nB8VsaipbLi/MC5+FRr29TJMHxzlplh86muyphysahyso9x7zRcWw7cDid+Pd9ZW3v0IPUESnLqqnsV9LgyLqa3vyeoYtqXVLZW3MjgMpHqJYmq8O12VcFxVsBDcm9H0BJI/wCJtZ2Luj5PJKi3K8MIRQgTJYoQgUI7RsR4jCyt8Zjo91MbDYlVw1bh0OmU7BjDeja0WGxNN0dejD75zPiPh/ELsw5Aq8yhRpPL6lR94m+qtGSPNqIW5RplPrLFd6ueU/C47qe8VSqWmOpVI84PQ6PQ+xhPRrsXHyP21Fdn8SAyAcI4aDv9Bo/2SHp37kPov3OBRHtYJWjOx7BRsztOAYuRj4esnFqpb7PL0Yj/ADCbOqiqgaqqSseyqBFZetZ5QOZz2Ud5SMSh7bLY5qVrZrOO8EweLVp56EXj4a7EOm+X3iaYeEMDBvTmstyXHXTgBR+A7zpbrxir5lumub6qj0lBGsdi7uST17zbmW9tF/VZYjomuxNWuh21M4KzAdzAnfoPwjOQUIdoRAc74B8WY3inw7RYtq/puPWteVVv4lYDXNr2Ot7+YnTbnylwPLycLjGNdiZFuPZ5gHPU5VtE9RsT6i4XY9vDaXsdnYqNsx2TNNaKMtyN02JJEZkRTZHrcPWxVh2Ik6cQrsAXLr0R2df66QslawDfaMNtGzrYMP1GWrD2bRkn9p/eq+ejNAwG+0j2fcwNdZv7GCj9flqo9l0JVfiFdYK4leye7t/XWa1QPaWKwNwMu2NVexy9jFmPcmWEXUxr7SURGAhuEqcUserh1z1uyMFOmU6IgI0njzxVjeF/D19htX9NyK2rxat/EzEa5tew3vfyEJ8+cby8nN4vk3ZeRbkWeYRz2uWOgeg2YSiRVStH/9k=';
const DEMO_LENTIL_SOUP_BASE64 =
  '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABaAHgDASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAAAAEDBAUGAgcI/8QAOhAAAgEDAgMEBgcIAwAAAAAAAQIDAAQRBSEGMVESE0GRByIzcYHRFBUjMkJSsRYXQ2FicqHBc5Ph/8QAGQEAAwEBAQAAAAAAAAAAAAAAAAECBQME/8QAIREAAgICAwACAwAAAAAAAAAAAAECEQMxBBIhE0EUUpH/2gAMAwEAAhEDEQA/AJ3oz9Gen2mlW+ta1apdXtyokihmXKQod19U82I335V6ciJGgRFVVHIKMAUIqxoqIMKoAAHgBS4zXJuygoo2HM+VGR0PnQAlFLt0NIceBoEFJSdoUdoUALRSdoUZpiCiiigArl0WRSrqrKeYYZBrqkoEeY+kv0a6fd6Vca1otqlre2ymSWGFcJMg3b1RyYDfbnRXpjosiMjDKsCCOoNFUmFj1FJRUFhRRVTqfEel6Y5iuLkd6OccY7TD3gcvjRdBstMknAGTSsqRjMz46AVno+OtGx2VNwjHm8kOw8s1e6bdWN9EZ7S5jufzOpyR8PChNPQdWtjodz7K3wOrnFdZufyReZp7lzpO2v5h50wGC7D2tvkdUOaQIkgzC+eqmpOQeVQ9QntLK3a7up1t1T+ITjfp/P3UBsMkHBGD0payOoekjTYR2VgMhXYSPIsQPwO9LpvpB068YCeJoVJx3iOJFHvxuKnugcJGtorlJEljWSNg6MMqynIIpaogKKKKYhyikoqSyv1xdRk0uWPS2VblsAMzYwPHB8DWW/dnbXUPfahq99jxitWWMM3jlsFjv7q2srYFLcEokKDw9ak0tjTejN2Ho94W0nsv9Bknn5kzXEj/AOM4/wAUsVxo2gTXH1fG3eTY7aRMWAxyGTsOdM67qsj3D2MDlVX2zg7sT+H51SEhEJxsozgV4s3Ip1E0MPGtXMupeJbpz9nBEg/rJY/6pn9oNQzzh/6//ao7G+W9VyqFOwfE5qVXmeXJfrPUsOKvEXEXEt0h+0gicf0Eqf8AdTTqmma3CtnfplSwYRz7bjowrIX888EKtbx9slsHbOPhT6EvEpkXBZR2l6GqjnnHfpEuPjl4lRtpuH9Bv4BHJo1g7IPVElsjfDcVCk4K4Y7oXFvotpbsw7JaBO7I8qhaDqsiXCWM7llb2Lk7qR+H5VqYD3kcyHx9YVo4siyKzNy4njdMg6RpsWk6etnDLJIisWBkO+9TqbibIruux5m7CiiigQ5RSUUixmY05ee0X+2mp+Rpyc95FDIPEYpS0OOzz+7DRatdxyfeMrHfx3+VJWi1zRPrAC4t8LcKMEHYOPnWXZ5raQxXETK45hhg1kZcbjI3MORTiq2OqqqMKoXx2GKajaYzuHQCMfdPWuhPGfxY99L3sf5x51yOtHdFNmeMfiz7q5V5rmQRW8TM7cgoyaKGP2gaXVrSOP7wlU7eG/yr0Gz9o39tZ/Q9E+rwbi4w1wwwANwg+dX8B7uGaQ7YGBWlx4OK9MrlZFN+fQzCaepiHkKer2GcFFFFMByiiipLGpRkUWpEkb2zHB5qa7YZFRZAyOHQ4ZTkGgV0MX+s2FrlZHY3K7PHGM7/AM/AVRXuuLeL3ZsInXw731iPKrP9nLa/uZbkXDgsxZocciee/SpyaBos0RgksEJ/EshJJ+Oa4uMpOmCeT6dGDlWFWLMEjHQtgDzNNd/Y5x9Igz/yr8627+j3hGRiz6BZsTzJQ5/Wmm9GvBrc+H7T4dof7qfx4l98v7v+mSiEDMGQJIOgbIPkaurLXFs17sWESL4916pPnzqx/djwWDkaDCp6rJIP0apMfCegWI7u3tJMnlH9Ikb9WOKPh6+xYnLK9ys7sta064UBJCtw2ypIMb+/lU67PdxJbJknmxqlv9Ce2VTbXMcXa/h9jcfHxqwtlkWNVaRnIAHaJ3NdoX9kdnpkiNcDlTlClgOZpSc+AroSJRSUUAZzgDiy24q4cgkEq/TreNY7qLPrKwGO1jocZz7xWnzXyfod3c2WsWs1pcy28neAduJyjYJ3GRX1Lpcjy6bC8js7FRlmOSaTLJdNuua7oNAiEyPG4eMlWHIinlvo5AFuo9xyda6kqLIBmgLosY2DD7C7Vh0benMXP5ovI1RuB0pvJ60qK7F5IwUfb3aqOi7VGa/jjBW0jyTzdqr1A6U/GBnlToTkzpUeRy8hLMeZNSUTArmOnKZAtJS1D1WR4tOmeN2RgpwynBFAFHx9xXbcLcOzyGVfptxG0drFn1mYjHax0Gc59wor561y7ub3WLma7uJbiTvGHblcs2Adhk0VRaR//9k=';

const DEMO_MEALS: Record<DemoMealKey, {
  imageBase64: string;
  imageUri: string;
  symptomKeys: SymptomKey[];
  title: Record<AppLanguage, string>;
  note: Record<AppLanguage, string>;
}> = {
  salmonRiceBowl: {
    imageBase64: DEMO_SALMON_RICE_BOWL_BASE64,
    imageUri: `data:image/jpeg;base64,${DEMO_SALMON_RICE_BOWL_BASE64}`,
    symptomKeys: ['bloating'],
    title: {
      en: 'Salmon rice bowl',
      de: 'Lachs-Reis-Bowl',
      fa: 'کاسه برنج و سالمون',
    },
    note: {
      en: 'Demo meal: salmon, white rice, cooked greens, tomato, and lemon.',
      de: 'Beispielmahlzeit: Lachs, weißer Reis, gegartes Gemüse, Tomate und Zitrone.',
      fa: 'وعده نمونه: سالمون، برنج سفید، سبزیجات پخته، گوجه و لیمو.',
    },
  },
  lentilSoup: {
    imageBase64: DEMO_LENTIL_SOUP_BASE64,
    imageUri: `data:image/jpeg;base64,${DEMO_LENTIL_SOUP_BASE64}`,
    symptomKeys: ['gas', 'cramps'],
    title: {
      en: 'Lentil soup',
      de: 'Linsensuppe',
      fa: 'سوپ عدس',
    },
    note: {
      en: 'Demo meal: lentil soup with herbs and a medium portion.',
      de: 'Beispielmahlzeit: Linsensuppe mit Kräutern in mittlerer Portion.',
      fa: 'وعده نمونه: سوپ عدس با سبزی‌های معطر و اندازه متوسط.',
    },
  },
};

const copy = {
  en: {
    back: 'Back',
    title: 'Photo Analysis',
    wizardStep1Subtitle: 'Step 1 of 4 — Capture',
    wizardStep2Subtitle: 'Step 2 of 4 — Voice & feeling',
    wizardStep3Subtitle: 'Step 3 of 4 — Analysis',
    wizardStep4Hint: 'Step 4 of 4 — Final check',
    wizardNext: 'Next',
    changePhoto: 'Change photo',
    usePhoto: 'Use Photo',
    cancel: 'Cancel',
    step2Prompt: 'What is this food? How do you feel?',
    generateAnalysis: 'Generate Analysis',
    isThisAccurate: 'Is this accurate?',
    yes: 'Yes',
    no: 'No',
    correctionPlaceholder: 'Tell us what to fix…',
    applyCorrection: 'Apply correction',
    recommendationUnchanged: 'Recommendation remains unchanged.',
    subtitle: 'Four steps: capture a photo, describe with voice or text, review the analysis, then confirm accuracy.',
    profileContext: 'Personalized for your gut profile, symptoms, and selected conditions',
    findingLocation: 'Finding nearby food options...',
    usingLocation: 'Using local context:',
    locationUnavailable: 'Location unavailable. Suggestions will stay general.',
    takePhoto: 'Take a Photo',
    takePhotoText: 'Opens your camera. When you have a clear shot, tap Next.',
    chooseGallery: 'Choose from Gallery',
    chooseGalleryText: 'Pick a meal photo, then tap Next.',
    analyzing: 'Analyzing your photo and notes with your gut profile...',
    analyzingBrand: 'NutriFlow',
    resultTitle: 'Personalized gut guidance',
    symptomsLabel: 'Symptoms & notes',
    symptomSelectorLabel: 'Select symptoms',
    symptomSelectorHint: 'Choose all that apply so the score reflects your current reaction.',
    symptomsPlaceholder: 'Before taking a photo you can note symptoms; after capture, describe how you feel.',
    howYouFeelLabel: 'Meal details & extra notes',
    howYouFeelPlaceholder: 'Example: This is lentil soup with onions. I ate a large bowl.',
    photoCapturedPrompt: 'Photo captured! Speak or type how you feel.',
    analyzeCombined: 'Analyze Meal',
    feelingsRequiredTitle: 'Add meal context first',
    feelingsRequiredMessage: 'Select at least one symptom or type a short meal note before generating the analysis.',
    share: 'Share Result',
    scoreLabel: 'Meal Impact Score',
    shareTitle: 'My NutriFlow meal analysis',
    snapshotHeading: 'NutriFlow meal snapshot',
    shareErrorTitle: 'Sharing unavailable',
    shareErrorMessage: 'Unable to open sharing right now.',
    disagree: "This didn't work for my body",
    planBTitle: 'Plan B',
    planBText: "I'm sorry this suggestion bothered you. I marked it as a trigger and your safer Plan B is: pause this food for now, sip ginger or peppermint tea, hydrate, and choose a very simple meal like rice, banana, or soup until your gut settles.",
    instantReliefTitle: 'Instant Relief',
    instantReliefText: 'Try peppermint tea, a warm compress on your belly, slow breathing, hydration, and rest. Pause the suspected trigger food for now. If pain is severe, worsening, or unusual, get medical help.',
    painApology: "I'm sorry this food may have bothered your body. Let's switch to a safer Plan B first.",
    medicalDisclaimer:
      'Important note: This analysis is for informational purposes only and does not replace a medical diagnosis. Seek medical care if you notice severe symptoms.',
    rankUp: 'Rank Up',
    chatPlaceholder: 'Correct or add details...',
    send: 'Send',
    newScan: 'New Scan',
    voiceUnavailableTitle: 'Voice unavailable',
    voiceUnavailableMessage:
      'Speech-to-text could not start. You can still type. If this persists, check microphone and speech recognition permissions for NutriFlow.',
    microphoneDisabledToast:
      'Microphone disabled. Please enable Microphone permissions in your Phone Settings (Settings > NutriFlow > Microphone).',
    voiceInputA11yLabel: 'Voice input',
    voiceInputA11yHint: 'Hold to record; release to finish.',
    correcting: 'Updating with your correction...',
    recording: 'Recording…',
    photoAnalysisFailedTitle: 'Photo analysis failed',
    photoAnalysisFailedTryAgain: 'Please try again.',
    photoUnavailableTitle: 'Photo unavailable',
    photoUnavailableMessage: 'Could not read the photo data. Please try again.',
    cameraNeededTitle: 'Camera access needed',
    cameraNeededMessage: 'Please allow camera access to take a meal photo.',
    demoMode: 'Demo Mode',
    cameraUnavailableTitle: 'Camera unavailable in this preview.',
    cameraUnavailableMessage: 'Use gallery upload or a sample meal image to continue.',
    webDemoTitle: 'Browser preview',
    webDemoMessage: 'In the browser, use gallery upload or built-in meal images instead of camera capture.',
    uploadImageFromGallery: 'Upload image from gallery',
    useSampleMealImage: 'Use sample meal image',
    demoMealHelper: 'Sample images continue through the same meal analysis flow as gallery uploads.',
    libraryNeededTitle: 'Photo library access needed',
    libraryNeededMessage: 'Please allow photo library access to choose a meal photo.',
    correctionFailedTitle: 'Correction failed',
    correctionFailedTryAgain: 'Please try again.',
    logMeal: 'Log meal',
    logMealSuccess: 'Meal logged!',
    logMealFailed: 'Could not save meal',
    logMealOffline: 'Saved offline — will sync when connected',
    logMealLocal: 'Saved locally in demo mode',
    loginRequired: 'Please sign in to log meals.',
    pendingScore: 'Pending',
    photoMealDefault: 'Photo meal',
    analysisInsightTitle: 'Analysis Insight',
    scientificSource: 'Scientific Source: USDA FoodData Central & Localized AI Adaptation.',
    insightFallbacks: {
      onionBloating: 'High onion load may worsen bloating',
      garlicBloating: 'Garlic may add a high-FODMAP bloating load',
      spicyBloating: 'Spice load may amplify bloating or cramps',
      creamyReflux: 'Creamy sauce may trigger reflux',
      greasyReflux: 'Greasy fat load may worsen reflux',
      acidicReflux: 'Acidic ingredients may aggravate reflux',
      constipationFiber: 'Fiber-rich ingredients support constipation relief',
      constipationLowFiber: 'Low fiber density may slow bowel rhythm',
      lowFiberDiversity: 'Low fiber diversity limits gut support',
      processedFat: 'Processed high-fat combination lowers gut support',
      balancedDiversity: 'Balanced protein and cooked plants support gut stability',
      fodmapIbs: 'High-FODMAP load may be risky for IBS',
      fructan: 'High fructan content detected',
      ibsTrigger: 'Potential IBS trigger identified',
      lowFiber: 'Low fiber density for your gut profile',
      inflammatory: 'High inflammatory food combination',
      symptomMatch: 'Current symptoms weighted in the score',
      gentle: 'Gentle digestion profile identified',
      profileSensitive: 'Adjusted for your selected gut profile',
    },
    expoGoTextOnlyHint:
      'Voice input is unavailable in this preview. Type your meal and symptoms below; the guided 4-step analysis still works.',
  },
  de: {
    back: 'Zurück',
    title: 'Fotoanalyse',
    wizardStep1Subtitle: 'Schritt 1 von 4 — Aufnahme',
    wizardStep2Subtitle: 'Schritt 2 von 4 — Stimme & Befinden',
    wizardStep3Subtitle: 'Schritt 3 von 4 — Analyse',
    wizardStep4Hint: 'Schritt 4 von 4 — Abschluss',
    wizardNext: 'Weiter',
    changePhoto: 'Foto ändern',
    usePhoto: 'Foto verwenden',
    cancel: 'Abbrechen',
    step2Prompt: 'Welche Mahlzeit ist zu sehen? Wie fühlst du dich?',
    generateAnalysis: 'Analyse erstellen',
    isThisAccurate: 'Stimmt das so?',
    yes: 'Ja',
    no: 'Nein',
    correctionPlaceholder: 'Was sollen wir korrigieren?',
    applyCorrection: 'Korrektur anwenden',
    recommendationUnchanged: 'Die Empfehlung bleibt unverändert.',
    subtitle: 'In vier Schritten: Foto aufnehmen, Mahlzeit beschreiben, Analyse prüfen und Ergebnis bestätigen.',
    profileContext: 'Personalisiert für dein Darmprofil, deine Symptome und Angaben',
    findingLocation: 'Suche passende Optionen in deiner Nähe…',
    usingLocation: 'Standortkontext:',
    locationUnavailable: 'Standort nicht verfügbar. Vorschläge bleiben allgemein.',
    takePhoto: 'Foto aufnehmen',
    takePhotoText: 'Öffnet die Kamera. Wenn das Foto passt, tippe auf Weiter.',
    chooseGallery: 'Aus Galerie wählen',
    chooseGalleryText: 'Wähle ein Foto deiner Mahlzeit und tippe dann auf Weiter.',
    analyzing: 'Foto und Notizen werden mit deinem Darmprofil ausgewertet…',
    analyzingBrand: 'NutriFlow',
    resultTitle: 'Personalisierte Mahlzeitenanalyse',
    symptomsLabel: 'Symptome & Notizen',
    symptomSelectorLabel: 'Symptome auswählen',
    symptomSelectorHint: 'Wähle alles aus, was zutrifft, damit der Score deine aktuelle Reaktion berücksichtigt.',
    symptomsPlaceholder: 'Vor dem Foto kannst du Symptome notieren; nach der Aufnahme beschreibst du dein Befinden.',
    howYouFeelLabel: 'Mahlzeitdetails und Notizen',
    howYouFeelPlaceholder: 'Zum Beispiel: Das ist Linsensuppe mit Zwiebeln. Ich habe eine große Schüssel gegessen.',
    photoCapturedPrompt: 'Foto gespeichert. Beschreibe jetzt, wie du dich fühlst.',
    analyzeCombined: 'Mahlzeit analysieren',
    feelingsRequiredTitle: 'Erst Kontext ergänzen',
    feelingsRequiredMessage: 'Wähle mindestens ein Symptom aus oder tippe eine kurze Mahlzeitnotiz, bevor du die Analyse erstellst.',
    share: 'Ergebnis teilen',
    scoreLabel: 'Mahlzeiten-Score',
    shareTitle: 'Meine NutriFlow-Mahlzeitenanalyse',
    snapshotHeading: 'NutriFlow Mahlzeitenübersicht',
    shareErrorTitle: 'Teilen nicht verfügbar',
    shareErrorMessage: 'Teilen kann gerade nicht geöffnet werden.',
    disagree: "Das hat meinem Körper nicht gutgetan",
    planBTitle: 'Plan B',
    planBText: 'Es tut mir leid, dass diese Empfehlung dir nicht gutgetan hat. Ich habe sie als Trigger gespeichert. Sicherer Plan B: pausiere dieses Lebensmittel, trinke Ingwer- oder Pfefferminztee, bleib hydriert und iss vorerst etwas Einfaches wie Reis, Banane oder Suppe.',
    instantReliefTitle: 'Soforthilfe',
    instantReliefText: 'Versuche Pfefferminztee, eine warme Kompresse auf dem Bauch, ruhiges Atmen, Wasser und etwas Ruhe. Pausiere das vermutete Trigger-Lebensmittel. Bei starken, zunehmenden oder ungewöhnlichen Schmerzen bitte medizinische Hilfe holen.',
    painApology: 'Es tut mir leid, dass dieses Essen deinem Körper nicht gutgetan haben könnte. Lass uns zuerst zu einem sichereren Plan B wechseln.',
    medicalDisclaimer:
      'Wichtiger Hinweis: Diese Analyse dient nur der Information und ersetzt keine ärztliche Diagnose. Suchen Sie bei schweren Symptomen einen Arzt auf.',
    rankUp: 'Levelaufstieg',
    chatPlaceholder: 'Korrigieren oder Details ergänzen...',
    send: 'Senden',
    newScan: 'Neuer Scan',
    voiceUnavailableTitle: 'Sprache nicht verfügbar',
    voiceUnavailableMessage:
      'Spracherkennung konnte nicht gestartet werden. Du kannst tippen. Prüfe ggf. Mikrofon- und Spracherkennungs-Berechtigungen für NutriFlow.',
    microphoneDisabledToast:
      'Mikrofon deaktiviert. Bitte aktiviere die Mikrofon-Berechtigung in den Telefoneinstellungen (Einstellungen > NutriFlow > Mikrofon).',
    voiceInputA11yLabel: 'Spracheingabe',
    voiceInputA11yHint: 'Halten zum Aufnehmen; loslassen zum Beenden.',
    correcting: 'Analyse wird mit deiner Korrektur aktualisiert...',
    recording: 'Aufnahme…',
    photoAnalysisFailedTitle: 'Fotoanalyse fehlgeschlagen',
    photoAnalysisFailedTryAgain: 'Bitte versuche es erneut.',
    photoUnavailableTitle: 'Foto nicht verfügbar',
    photoUnavailableMessage: 'Die Fotodaten konnten nicht gelesen werden. Bitte erneut versuchen.',
    cameraNeededTitle: 'Kamerazugriff nötig',
    cameraNeededMessage: 'Bitte erlaube den Kamerazugriff, um ein Mahlzeitenfoto aufzunehmen.',
    demoMode: 'Demo-Modus',
    cameraUnavailableTitle: 'Kamera in dieser Vorschau nicht verfügbar.',
    cameraUnavailableMessage: 'Nutze den Galerie-Upload oder ein Beispielbild, um fortzufahren.',
    webDemoTitle: 'Browser-Vorschau',
    webDemoMessage: 'Im Browser kannst du Galerie-Upload oder integrierte Beispielbilder statt Kameraaufnahme nutzen.',
    uploadImageFromGallery: 'Bild aus Galerie hochladen',
    useSampleMealImage: 'Beispiel-Mahlzeit verwenden',
    demoMealHelper: 'Beispielbilder nutzen denselben Analyseablauf wie Galerie-Uploads.',
    libraryNeededTitle: 'Fotomediathek-Zugriff nötig',
    libraryNeededMessage: 'Bitte erlaube den Zugriff auf die Fotomediathek, um ein Bild auszuwählen.',
    correctionFailedTitle: 'Korrektur fehlgeschlagen',
    correctionFailedTryAgain: 'Bitte versuche es erneut.',
    logMeal: 'Mahlzeit speichern',
    logMealSuccess: 'Mahlzeit gespeichert!',
    logMealFailed: 'Mahlzeit konnte nicht gespeichert werden',
    logMealOffline: 'Offline gespeichert — Synchronisation folgt bei Verbindung',
    logMealLocal: 'Im Demo-Modus lokal gespeichert',
    loginRequired: 'Bitte melde dich an, um Mahlzeiten zu speichern.',
    pendingScore: 'Ausstehend',
    photoMealDefault: 'Mahlzeit (Foto)',
    analysisInsightTitle: 'Wichtige Erkenntnisse',
    scientificSource: 'Wissenschaftliche Quelle: USDA FoodData Central & lokalisierte KI-Anpassung.',
    insightFallbacks: {
      onionBloating: 'Hohe Zwiebelmenge kann Blähungen verstärken',
      garlicBloating: 'Knoblauch kann die FODMAP-Belastung erhöhen',
      spicyBloating: 'Schärfe kann Blähungen oder Krämpfe verstärken',
      creamyReflux: 'Cremige Sauce kann Reflux auslösen',
      greasyReflux: 'Fettige Speisen können Reflux verschlimmern',
      acidicReflux: 'Säurehaltige Zutaten können Reflux reizen',
      constipationFiber: 'Ballaststoffreiche Zutaten unterstützen die Regelmäßigkeit',
      constipationLowFiber: 'Geringe Ballaststoffdichte kann den Darmrhythmus bremsen',
      lowFiberDiversity: 'Wenig Ballaststoffvielfalt begrenzt die Darmunterstützung',
      processedFat: 'Verarbeitete fettreiche Kombination senkt die Darmverträglichkeit',
      balancedDiversity: 'Ausgewogenes Protein und gegartes Gemüse stabilisieren den Darm',
      fodmapIbs: 'Hohe FODMAP-Belastung kann bei Reizdarm riskant sein',
      fructan: 'Hoher Fruktangehalt erkannt',
      ibsTrigger: 'Möglicher Reizdarm-Trigger identifiziert',
      lowFiber: 'Geringe Ballaststoffdichte für dein Darmprofil',
      inflammatory: 'Entzündungsfördernde Lebensmittelkombination',
      symptomMatch: 'Aktuelle Symptome im Score berücksichtigt',
      gentle: 'Sanftes Verdauungsprofil erkannt',
      profileSensitive: 'An dein ausgewähltes Darmprofil angepasst',
    },
    expoGoTextOnlyHint:
      'Spracheingabe ist in dieser Vorschau nicht verfügbar. Beschreibe Mahlzeit und Symptome im Textfeld; die geführte 4-Schritte-Analyse funktioniert weiterhin.',
  },
  fa: {
    back: 'بازگشت',
    title: 'تحلیل عکس غذا',
    wizardStep1Subtitle: 'مرحله ۱ از ۴ – عکس',
    wizardStep2Subtitle: 'مرحله ۲ از ۴ – توضیح و احساس',
    wizardStep3Subtitle: 'مرحله ۳ از ۴ – تحلیل',
    wizardStep4Hint: 'مرحله ۴ از ۴ – بررسی نهایی',
    wizardNext: 'بعدی',
    changePhoto: 'تغییر عکس',
    usePhoto: 'استفاده از عکس',
    cancel: 'لغو',
    step2Prompt: 'این وعده غذایی چیست و چه احساسی دارید؟',
    generateAnalysis: 'ایجاد تحلیل',
    isThisAccurate: 'این تحلیل درست است؟',
    yes: 'بله',
    no: 'خیر',
    correctionPlaceholder: 'بگویید چه چیزی را اصلاح کنیم…',
    applyCorrection: 'اعمال اصلاح',
    recommendationUnchanged: 'پیشنهاد بدون تغییر ماند.',
    subtitle: 'در چهار مرحله: عکس بگیرید، وعده را توضیح دهید، تحلیل را بررسی کنید و نتیجه را تأیید کنید.',
    profileContext: 'شخصی‌سازی‌شده بر اساس پروفایل گوارش، علائم و اطلاعات انتخابی شما',
    findingLocation: 'در حال یافتن گزینه‌های غذایی نزدیک…',
    usingLocation: 'زمینه مکانی:',
    locationUnavailable: 'موقعیت در دسترس نیست. پیشنهادها عمومی می‌مانند.',
    takePhoto: 'گرفتن عکس',
    takePhotoText: 'دوربین باز می‌شود. وقتی عکس واضح بود، روی «بعدی» بزنید.',
    chooseGallery: 'انتخاب از گالری',
    chooseGalleryText: 'یک عکس از وعده غذایی انتخاب کنید، سپس روی «بعدی» بزنید.',
    analyzing: 'در حال تحلیل عکس و یادداشت‌ها بر اساس پروفایل گوارش شما…',
    analyzingBrand: 'NutriFlow',
    resultTitle: 'تحلیل شخصی وعده غذایی',
    symptomsLabel: 'علائم و یادداشت‌ها',
    symptomSelectorLabel: 'انتخاب علائم',
    symptomSelectorHint: 'هر موردی را که صدق می‌کند انتخاب کنید تا امتیاز با واکنش فعلی شما هماهنگ شود.',
    symptomsPlaceholder: 'قبل از عکس می‌توانید علائم را بنویسید؛ بعد از عکس، احساس خود را توضیح دهید.',
    howYouFeelLabel: 'جزئیات وعده و یادداشت‌های بیشتر',
    howYouFeelPlaceholder: 'مثال: این سوپ عدس با پیاز است. یک کاسه بزرگ خوردم.',
    photoCapturedPrompt: 'عکس ثبت شد. اکنون احساس خود را بنویسید یا بگویید.',
    analyzeCombined: 'تحلیل غذا',
    feelingsRequiredTitle: 'ابتدا زمینه غذا را اضافه کنید',
    feelingsRequiredMessage: 'قبل از ایجاد تحلیل، حداقل یک علامت انتخاب کنید یا یک یادداشت کوتاه درباره غذا بنویسید.',
    share: 'اشتراک‌گذاری نتیجه',
    scoreLabel: 'امتیاز تأثیر غذا',
    shareTitle: 'تحلیل غذای NutriFlow من',
    snapshotHeading: 'خلاصه غذای NutriFlow',
    shareErrorTitle: 'اشتراک‌گذاری در دسترس نیست',
    shareErrorMessage: 'اکنون امکان باز کردن اشتراک‌گذاری وجود ندارد.',
    disagree: 'این برای بدن من خوب نبود',
    planBTitle: 'برنامه جایگزین',
    planBText: 'متأسفم که این پیشنهاد حال شما را بدتر کرد. آن را به‌عنوان محرک ثبت کردم. برنامه جایگزین امن‌تر: فعلاً این غذا را کنار بگذارید، چای زنجبیل یا نعناع بنوشید، آب کافی بخورید و تا آرام شدن گوارش، یک غذای ساده مثل برنج، موز یا سوپ انتخاب کنید.',
    instantReliefTitle: 'آرام‌سازی فوری',
    instantReliefText: 'چای نعناع، کمپرس گرم روی شکم، تنفس آرام، آب کافی و استراحت را امتحان کنید. فعلاً غذای محرک احتمالی را کنار بگذارید. اگر درد شدید، رو به بدتر شدن یا غیرمعمول است، کمک پزشکی بگیرید.',
    painApology: 'متأسفم که این غذا ممکن است بدن شما را اذیت کرده باشد. ابتدا سراغ یک برنامه جایگزین امن‌تر برویم.',
    medicalDisclaimer:
      'نکته مهم: این تحلیل فقط برای اطلاع است و جایگزین تشخیص پزشکی نیست. اگر علائم شدید دارید، کمک پزشکی بگیرید.',
    rankUp: 'ارتقای رتبه',
    chatPlaceholder: 'اصلاح کنید یا جزئیات اضافه کنید...',
    send: 'ارسال',
    newScan: 'اسکن جدید',
    voiceUnavailableTitle: 'صدا در دسترس نیست',
    voiceUnavailableMessage:
      'تبدیل گفتار به متن شروع نشد. همچنان می‌توانید تایپ کنید. اگر ادامه داشت، مجوزهای میکروفون و تشخیص گفتار NutriFlow را بررسی کنید.',
    microphoneDisabledToast:
      'میکروفون غیرفعال است. لطفاً مجوز میکروفون را در تنظیمات گوشی فعال کنید (تنظیمات > NutriFlow > میکروفون).',
    voiceInputA11yLabel: 'ورودی صوتی',
    voiceInputA11yHint: 'برای ضبط نگه دارید؛ برای پایان رها کنید.',
    correcting: 'در حال به‌روزرسانی با اصلاح شما…',
    recording: 'در حال ضبط…',
    photoAnalysisFailedTitle: 'تحلیل عکس ناموفق بود',
    photoAnalysisFailedTryAgain: 'لطفاً دوباره تلاش کنید.',
    photoUnavailableTitle: 'عکس در دسترس نیست',
    photoUnavailableMessage: 'داده‌های عکس خوانده نشد. لطفاً دوباره تلاش کنید.',
    cameraNeededTitle: 'دسترسی به دوربین لازم است',
    cameraNeededMessage: 'برای گرفتن عکس غذا، اجازه دسترسی به دوربین را بدهید.',
    demoMode: 'حالت دمو',
    cameraUnavailableTitle: 'دوربین در این پیش‌نمایش در دسترس نیست.',
    cameraUnavailableMessage: 'برای ادامه، از گالری بارگذاری کنید یا یک تصویر غذای نمونه انتخاب کنید.',
    webDemoTitle: 'پیش‌نمایش مرورگر',
    webDemoMessage: 'در مرورگر، به جای دوربین از بارگذاری تصویر یا تصاویر نمونه غذا استفاده کنید.',
    uploadImageFromGallery: 'بارگذاری تصویر از گالری',
    useSampleMealImage: 'استفاده از تصویر نمونه غذا',
    demoMealHelper: 'تصاویر نمونه همان مسیر تحلیل گالری را طی می‌کنند.',
    libraryNeededTitle: 'دسترسی به گالری لازم است',
    libraryNeededMessage: 'برای انتخاب عکس غذا، اجازه دسترسی به گالری را بدهید.',
    correctionFailedTitle: 'اصلاح ناموفق بود',
    correctionFailedTryAgain: 'لطفا دوباره تلاش کنید.',
    logMeal: 'ثبت غذا',
    logMealSuccess: 'غذا ثبت شد!',
    logMealFailed: 'ذخیره غذا ممکن نبود',
    logMealOffline: 'آفلاین ذخیره شد – پس از اتصال همگام می‌شود',
    logMealLocal: 'در حالت دمو به‌صورت محلی ذخیره شد',
    loginRequired: 'برای ثبت غذا وارد شوید.',
    pendingScore: 'در انتظار',
    photoMealDefault: 'غذای عکس',
    analysisInsightTitle: 'نکات کلیدی تحلیل',
    scientificSource: 'منبع علمی: USDA FoodData Central و سازگاری محلی با هوش مصنوعی.',
    insightFallbacks: {
      onionBloating: 'بار بالای پیاز ممکن است نفخ را بدتر کند',
      garlicBloating: 'سیر می‌تواند بار FODMAP و نفخ را بیشتر کند',
      spicyBloating: 'غذای تند ممکن است نفخ یا گرفتگی را تشدید کند',
      creamyReflux: 'سس خامه‌ای ممکن است ریفلاکس را تحریک کند',
      greasyReflux: 'چربی زیاد می‌تواند ریفلاکس را بدتر کند',
      acidicReflux: 'مواد اسیدی ممکن است ریفلاکس را تحریک کنند',
      constipationFiber: 'مواد پرفیبر به بهبود یبوست کمک می کنند',
      constipationLowFiber: 'فیبر کم ممکن است ریتم روده را کند کند',
      lowFiberDiversity: 'تنوع کم فیبر، حمایت گوارشی را محدود می‌کند',
      processedFat: 'ترکیب پرچرب و فرآوری‌شده امتیاز گوارش را پایین می‌آورد',
      balancedDiversity: 'پروتئین متعادل و سبزی پخته به ثبات گوارش کمک می‌کند',
      fodmapIbs: 'بار بالای FODMAP برای IBS می‌تواند پرریسک باشد',
      fructan: 'محتوای بالای فروکتان شناسایی شد',
      ibsTrigger: 'محرک احتمالی IBS شناسایی شد',
      lowFiber: 'تراکم فیبر برای پروفایل گوارش شما پایین است',
      inflammatory: 'ترکیب غذایی التهاب‌زا شناسایی شد',
      symptomMatch: 'علائم فعلی در امتیاز لحاظ شد',
      gentle: 'الگوی هضم ملایم شناسایی شد',
      profileSensitive: 'بر اساس پروفایل گوارش انتخابی شما تنظیم شد',
    },
    expoGoTextOnlyHint:
      'ورودی صوتی در این پیش‌نمایش در دسترس نیست. غذا و علائم خود را در کادر متن بنویسید؛ تحلیل مرحله‌ای همچنان فعال است.',
  },
} as const;

type NativeLocationModule = {
  Accuracy: { Balanced: number };
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (options: { accuracy: number }) => Promise<{
    coords: { latitude: number; longitude: number };
  }>;
  reverseGeocodeAsync: (coords: { latitude: number; longitude: number }) => Promise<{
    city?: string | null;
    district?: string | null;
    subregion?: string | null;
    region?: string | null;
    country?: string | null;
  }[]>;
};

type VoiceModule = {
  start: (locale?: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy?: () => Promise<void>;
  removeAllListeners?: () => void;
  onSpeechResults?: (event: { value?: string[] }) => void;
  onSpeechPartialResults?: (event: { value?: string[] }) => void;
  onSpeechError?: (event: unknown) => void;
};

function formatTriggerMemories(items: TriggerFeedbackItem[]): string[] {
  return items.map((item) =>
    [
      item.mealName,
      item.adviceSummary,
      item.symptoms?.length ? `Symptoms: ${item.symptoms.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' - ')
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

let loadedVoiceModule: VoiceModule | null = null;

async function loadVoiceModule(): Promise<VoiceModule | null> {
  try {
    const voiceModule = await import('@react-native-voice/voice');
    const Voice = (voiceModule.default ?? voiceModule) as VoiceModule;

    if (typeof Voice.start !== 'function' || typeof Voice.stop !== 'function') {
      return null;
    }

    loadedVoiceModule = Voice;
    return Voice;
  } catch (error) {
    console.warn('Voice module unavailable:', error);
    return null;
  }
}

function getMealTypeForClock(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'snack';
  return 'dinner';
}

function formatLocationContext(
  coordinates: { latitude: number; longitude: number },
  place?: {
    city?: string | null;
    district?: string | null;
    subregion?: string | null;
    region?: string | null;
    country?: string | null;
  }
): string {
  const areaParts = [
    place?.city,
    place?.district,
    place?.subregion,
    place?.region,
    place?.country,
  ].filter(Boolean);
  const area = Array.from(new Set(areaParts)).join(', ') || 'Unknown area';
  const latitude = coordinates.latitude.toFixed(4);
  const longitude = coordinates.longitude.toFixed(4);

  return `${area} (${latitude}, ${longitude})`;
}

/** City / region / country for AI retail prompts (no coordinates). */
function formatRetailLocationHint(place?: {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  if (!place) return '';
  const parts = [place.city, place.region ?? place.subregion, place.country].filter(Boolean);
  return [...new Set(parts.map(String))].join(', ');
}

function isIosSimulatorRuntime(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (Constants.isDevice === false) return true;

  const executionEnvironment = String(Constants.executionEnvironment ?? '').toLowerCase();
  const iosPlatform = Constants.platform?.ios?.platform?.toLowerCase() ?? '';
  const iosModel = Constants.platform?.ios?.model?.toLowerCase() ?? '';
  const deviceName = Constants.deviceName?.toLowerCase() ?? '';

  return ['x86_64', 'i386', 'arm64'].includes(iosPlatform)
    || iosModel.includes('simulator')
    || deviceName.includes('simulator')
    || (__DEV__ && executionEnvironment === 'storeclient');
}

function ensurePainApology(analysis: string, apology: string, hasPainSymptom: boolean): string {
  if (!hasPainSymptom) return analysis;
  return analysis.trim().startsWith(apology) ? analysis : `${apology}\n\n${analysis}`;
}

function hasPainText(value: string): boolean {
  return /stomach ache|stomach pain|abdominal pain|belly pain|cramp|bloating pain|bauchschmerz|bauchschmerzen|krampf|درد|دل درد|گرفتگی/i.test(value);
}

function cleanMarkdownLine(value: string): string {
  return value
    .replace(/^#+\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[`_]/g, '')
    .trim();
}

function isAnalysisInsightHeader(line: string, language: AppLanguage): boolean {
  const normalized = cleanMarkdownLine(line)
    .replace(/[:：]\s*$/, '')
    .toLocaleLowerCase();
  const localizedTitle = copy[language].analysisInsightTitle.toLocaleLowerCase();

  return [
    localizedTitle,
    'analysis insight',
    'analyse-einblick',
    'analyse einblick',
    'بینش تحلیل',
  ].includes(normalized);
}

function isInsightSectionBoundary(line: string, language: AppLanguage): boolean {
  const normalized = cleanMarkdownLine(line)
    .replace(/[:：]\s*$/, '')
    .toLocaleLowerCase();

  return [
    copy[language].analysisInsightTitle.toLocaleLowerCase(),
    'tips',
    'tipps',
    'نکات',
    copy[language].instantReliefTitle.toLocaleLowerCase(),
    copy[language].scoreLabel.toLocaleLowerCase(),
    'gut score',
    'darm-score',
    'امتیاز روده',
  ].includes(normalized);
}

function extractAnalysisInsightBullets(aiText: string, language: AppLanguage): string[] {
  const lines = aiText.split('\n');
  const insights: string[] = [];
  let isCollecting = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!isCollecting && isAnalysisInsightHeader(trimmed, language)) {
      isCollecting = true;
      continue;
    }

    if (!isCollecting) continue;
    if (!trimmed) {
      if (insights.length > 0) break;
      continue;
    }

    if (insights.length > 0 && isInsightSectionBoundary(trimmed, language)) break;
    if (trimmed.startsWith('|')) continue;

    const cleaned = cleanMarkdownLine(trimmed);
    if (!cleaned || isInsightSectionBoundary(cleaned, language)) {
      if (insights.length > 0) break;
      continue;
    }

    insights.push(cleaned.replace(/[.;؛]\s*$/, ''));
    if (insights.length >= 3) break;
  }

  return insights;
}

function isGenericAnalysisInsight(value: string): boolean {
  const normalized = cleanMarkdownLine(value).toLocaleLowerCase();

  return [
    /\bvegetables?\s+(?:are|is)\s+healthy\b/,
    /\bprotein\s+(?:is|supports|helps)\b/,
    /\bhealthy\s+(?:meal|choice|food)\b/,
    /\bgood\s+source\s+of\s+protein\b/,
    /\bbalanced\s+meal\b/,
    /gemüse.*gesund/,
    /protein.*(?:gut|hilft|unterstützt)/,
    /غذا.*سالم/,
    /سبزی.*سالم/,
    /پروتئین.*(?:خوب|مفید)/,
  ].some((pattern) => pattern.test(normalized));
}

function mergeAnalysisInsights(primary: string[], fallback: string[]): string[] {
  const merged: string[] = [];

  [...primary.filter((insight) => !isGenericAnalysisInsight(insight)), ...fallback].forEach((insight) => {
    if (!merged.includes(insight) && merged.length < 3) merged.push(insight);
  });

  return merged;
}

function stripAnalysisInsightSection(aiText: string, language: AppLanguage): string {
  const lines = aiText.split('\n');
  const keptLines: string[] = [];
  let isSkipping = false;
  let skippedAnyInsight = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!isSkipping && isAnalysisInsightHeader(trimmed, language)) {
      isSkipping = true;
      skippedAnyInsight = true;
      continue;
    }

    if (isSkipping) {
      if (!trimmed) {
        isSkipping = false;
        continue;
      }

      if (isInsightSectionBoundary(trimmed, language) && !isAnalysisInsightHeader(trimmed, language)) {
        isSkipping = false;
        keptLines.push(line);
      }
      continue;
    }

    keptLines.push(line);
  }

  return skippedAnyInsight ? keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() : aiText;
}

function buildFallbackAnalysisInsights(
  aiText: string,
  symptoms: string[],
  conditions: string[],
  language: AppLanguage,
): string[] {
  const insightCopy = copy[language].insightFallbacks;
  const combinedText = `${aiText} ${symptoms.join(' ')} ${conditions.join(' ')}`.toLocaleLowerCase();
  const insights: string[] = [];
  const addInsight = (value: string) => {
    if (!insights.includes(value) && insights.length < 3) insights.push(value);
  };
  const has = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(combinedText));
  const hasBloating = has([/\bbloating\b/, /\bbloated\b/, /\bgas\b/, /\bheaviness\b/, /bläh/, /blaeh/, /نفخ/, /گاز/, /سنگینی/]);
  const hasConstipation = has([/\bconstipation\b/, /\bconstipated\b/, /verstopfung/, /یبوست/]);
  const hasReflux = has([/\breflux\b/, /\bheartburn\b/, /\bacid\b/, /sodbrennen/, /ریفلاکس/, /رفلاکس/, /سوزش معده/]);
  const hasIbs = has([/\bibs\b/, /\birritable bowel\b/, /reizdarm/, /سندرم روده تحریک پذیر/, /روده تحریک پذیر/]);
  const hasOnion = has([/\bonions?\b/, /zwiebel/, /پیاز/]);
  const hasGarlic = has([/\bgarlic\b/, /knoblauch/, /سیر/]);
  const hasSpicy = has([/\bspicy\b/, /\bchili\b/, /\bhot sauce\b/, /scharf/, /تند/, /فلفل/]);
  const hasCreamy = has([/\bcream\b/, /\bcreamy\b/, /\bcheese\b/, /\bmilk\b/, /\blactose\b/, /sahne/, /cremig/, /käse/, /milch/, /خامه/, /پنیر/, /شیر/, /لاکتوز/]);
  const hasGreasy = has([/\bfried\b/, /\bgreasy\b/, /\bfries?\b/, /\bhigh[-\s]?fat\b/, /frittiert/, /fettig/, /pommes/, /سرخ/, /چرب/]);
  const hasAcidic = has([/\btomato\b/, /\bcitrus\b/, /\bcoffee\b/, /\bchocolate\b/, /\balcohol\b/, /tomate/, /zitrus/, /kaffee/, /schokolade/, /گوجه/, /مرکبات/, /قهوه/, /شکلات/]);
  const hasFiberRich = has([/\boats?\b/, /\bchia\b/, /\bflax\b/, /\bkiwi\b/, /\bprunes?\b/, /\bplums?\b/, /\bberries\b/, /\bvegetables?\b/, /\blegumes?\b/, /\bhigh fiber\b/, /hafer/, /leinsamen/, /pflaume/, /ballaststoff/, /جو دوسر/, /چیا/, /کتان/, /کیوی/, /آلو/, /سبزی/, /فیبر/]);
  const hasProcessed = has([/\bburger\b/, /\bfast food\b/, /\bpizza\b/, /\bnuggets?\b/, /\bcookies?\b/, /\bcakes?\b/, /\bcandy\b/, /\bsoda\b/, /\bprocessed\b/, /burger/, /pizza/, /fastfood/, /kuchen/, /keks/, /limonade/, /فست فود/, /برگر/, /پیتزا/, /کیک/, /شیرینی/, /نوشابه/]);
  const hasLowFiber = has([/\blow fiber\b/, /\brefined\b/, /\bwhite bread\b/, /\bpastry\b/, /\bdonut\b/, /wenig ballast/, /weißbrot/, /weissbrot/, /raffiniert/, /کم فیبر/, /نان سفید/, /تصفیه/]);
  const highFodmap = has([/\bonions?\b/, /\bgarlic\b/, /\bwheat\b/, /\bbarley\b/, /\bbeans?\b/, /\blentils?\b/, /\bhigh[-\s]?fodmap\b/, /zwiebel/, /knoblauch/, /weizen/, /gerste/, /bohnen/, /linsen/, /پیاز/, /سیر/, /گندم/, /حبوبات/, /عدس/, /فودمپ/]);
  const balanced = has([/\bsalmon\b/, /\bfish\b/, /\bchicken\b/, /\btofu\b/, /\beggs?\b/, /\brice\b/, /\bpotatoes?\b/, /\bzucchini\b/, /\bcarrots?\b/, /\bcooked vegetables?\b/, /lachs/, /fisch/, /hähnchen/, /haehnchen/, /reis/, /kartoffel/, /zucchini/, /karotte/, /سالمون/, /ماهی/, /مرغ/, /برنج/, /سیب زمینی/, /کدو/, /هویج/, /سبزی پخته/]);

  if (hasBloating && hasOnion) addInsight(insightCopy.onionBloating);
  if (hasBloating && hasGarlic) addInsight(insightCopy.garlicBloating);
  if ((hasBloating || hasIbs) && hasSpicy) addInsight(insightCopy.spicyBloating);
  if (hasReflux && hasCreamy) addInsight(insightCopy.creamyReflux);
  if (hasReflux && hasGreasy) addInsight(insightCopy.greasyReflux);
  if (hasReflux && hasAcidic) addInsight(insightCopy.acidicReflux);
  if (hasConstipation && hasFiberRich && !hasBloating) addInsight(insightCopy.constipationFiber);
  if (hasConstipation && (hasLowFiber || hasProcessed || hasGreasy)) addInsight(insightCopy.constipationLowFiber);
  if ((hasIbs || hasBloating) && highFodmap) addInsight(insightCopy.fodmapIbs);
  if (hasProcessed || (hasGreasy && hasCreamy)) addInsight(insightCopy.processedFat);
  if (hasLowFiber || hasProcessed) addInsight(insightCopy.lowFiberDiversity);
  if (balanced && !hasProcessed && !hasGreasy) addInsight(insightCopy.balancedDiversity);

  if (/onion|garlic|wheat|barley|beans?|lentils?|high-fodmap|fodmap|پیاز|سیر|گندم|حبوبات|عدس/i.test(combinedText)) {
    addInsight(insightCopy.fructan);
  }
  if (/ibs|bloating|gas|pain|cramp|reflux|reizdarm|bläh|schmerz|نفخ|گاز|درد|ریفلاکس/i.test(combinedText)) {
    addInsight(insightCopy.ibsTrigger);
  }
  if (/low fiber|refined|white bread|pasta|cookie|cake|sugar|processed|wenig ballast|کم فیبر|قند|شیرینی/i.test(combinedText)) {
    addInsight(insightCopy.lowFiber);
  }
  if (/fried|greasy|spicy|high-fat|inflammatory|frittiert|scharf|چرب|سرخ|تند|التهاب/i.test(combinedText)) {
    addInsight(insightCopy.inflammatory);
  }
  if (symptoms.length > 0) addInsight(insightCopy.symptomMatch);
  if (/gentle|supportive|easy to digest|gut-friendly|sanft|verträglich|ملایم|آسان/i.test(combinedText)) {
    addInsight(insightCopy.gentle);
  }
  addInsight(insightCopy.profileSensitive);

  return insights.slice(0, 3);
}

function getVoiceLocale(language: AppLanguage): string {
  return {
    en: 'en-US',
    de: 'de-DE',
    fa: 'fa-IR',
  }[language];
}

function isDifferentFoodCorrection(correction: string): boolean {
  return /\b(it is|it's|this is|actually|not|instead|tea|herbal tea|soup|rice|potato|zucchini|yogurt|banana|das ist|eigentlich|tee|suppe|reis|kartoffel)\b/i.test(correction)
    || /(?:این|غذا|چای|سوپ|برنج|سیب زمینی|ماست|موز)/.test(correction);
}

export default function PhotoAnalysisScreen() {
  const params = useLocalSearchParams<{ historyId?: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [lastImageBase64, setLastImageBase64] = useState('');
  const [cameraUnavailable, setCameraUnavailable] = useState(() => isIosSimulatorRuntime());
  const [analysis, setAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<'feelings' | 'correction' | null>(null);
  const [locationContext, setLocationContext] = useState('');
  const [retailLocationHint, setRetailLocationHint] = useState('');
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [language, setLanguage] = useState<AppLanguage>('en');
  /** Pre-analyze field: what the meal is + how the user feels (voice or text). */
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [accuracyAnswer, setAccuracyAnswer] = useState<'yes' | 'no' | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [mealDescription, setMealDescription] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomKey[]>([]);
  const [profileConditions, setProfileConditions] = useState<MedicalCondition[]>([]);
  /** Corrections the user submitted this session (typed or sent after voice); fed to revise prompts as prior context. */
  const [userFeedback, setUserFeedback] = useState<string[]>([]);
  const [todaysSupplements, setTodaysSupplements] = useState<SupplementHistoryItem[]>([]);
  const [triggerMemories, setTriggerMemories] = useState<TriggerFeedbackItem[]>([]);
  const [planBMessage, setPlanBMessage] = useState('');
  const [rankUpBadge, setRankUpBadge] = useState('');
  /** Remount results ScrollView after a fresh analysis so the pane scrolls cleanly away from prior inputs. */
  const [resultsScrollKey, setResultsScrollKey] = useState(0);
  const micGlowOpacity = useRef(new Animated.Value(1)).current;
  const expoSpeechStopRef = useRef<(() => Promise<void>) | null>(null);
  const voiceEngineRef = useRef<'rn-voice' | 'expo-speech' | null>(null);
  const voiceDestinationRef = useRef<'feelings' | 'correction'>('feelings');
  const latestTranscriptRef = useRef('');
  const voiceHoldActiveRef = useRef(false);
  /** Pulse scale + glow opacity while the mic is actively listening. */
  const recordingPulse = useRef(new Animated.Value(1)).current;
  const { user, isGuest } = useAuth();
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
  });
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);
  const t = copy[language];
  /** Dev client / standalone only — Expo Go has no custom native STT modules. */
  const voiceNativeEnabled = canUseNativeSpeechToText();
  const isWebFeedbackDemo = Platform.OS === 'web';
  const isCameraFallbackActive = isWebFeedbackDemo || isIosSimulatorRuntime() || cameraUnavailable;
  const isRtlLanguage = isAppRtlLanguage(language);
  const selectedSymptomLabels = selectedSymptoms.map((symptomKey) => {
    const option = SYMPTOM_OPTIONS.find((item) => item.key === symptomKey);
    return option?.promptLabel ?? symptomKey;
  });
  const selectedSymptomSummary = selectedSymptomLabels.length > 0
    ? selectedSymptomLabels.join(', ')
    : 'None selected';
  const mealDescriptionText = mealDescription.trim();
  const analysisInputSummary = [
    mealDescriptionText ? `Meal details: ${mealDescriptionText}` : '',
    selectedSymptomLabels.length > 0 ? `Selected symptoms: ${selectedSymptomSummary}` : '',
  ].filter(Boolean).join('\n');
  const hasAnalysisInput = Boolean(mealDescriptionText || selectedSymptoms.length > 0);
  const userEnteredSymptoms = selectedSymptomLabels;
  const promptConditions = getPromptConditions(profileConditions);
  const currentSymptoms = [
    ...promptConditions,
    ...userEnteredSymptoms,
  ];
  const hasPainSymptom = currentSymptoms.some((symptom) =>
    hasPainText(symptom)
  );
  const mealImpactScore = resolveMealImpactScore(analysis, currentSymptoms, mealDescriptionText, language);
  const extractedAnalysisInsights = extractAnalysisInsightBullets(analysis, language);
  const analysisInsights = mergeAnalysisInsights(
    extractedAnalysisInsights,
    buildFallbackAnalysisInsights(analysis, currentSymptoms, promptConditions, language),
  );
  const displayAnalysisText = stripAnalysisInsightSection(analysis, language);
  const wizardSubtitle =
    wizardStep === 1 ? t.wizardStep1Subtitle : wizardStep === 2 ? t.wizardStep2Subtitle : t.wizardStep3Subtitle;
  const canRecordFeelings = wizardStep === 2 && Boolean(photoUri && lastImageBase64);
  const cameraFallbackTitle = isWebFeedbackDemo ? t.webDemoTitle : t.cameraUnavailableTitle;
  const cameraFallbackMessage = isWebFeedbackDemo ? t.webDemoMessage : t.cameraUnavailableMessage;

  useEffect(() => {
    getUserProfileSettings()
      .then((settings) => setProfileConditions(settings.conditions))
      .catch(console.warn);
  }, []);

  useEffect(() => {
    if (!voiceNativeEnabled) {
      recordingPulse.setValue(1);
      micGlowOpacity.setValue(1);
      return;
    }
    if (!isListening || voiceTarget === null) {
      recordingPulse.setValue(1);
      micGlowOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(recordingPulse, {
            toValue: 1.14,
            duration: 520,
            useNativeDriver: true,
          }),
          Animated.timing(recordingPulse, {
            toValue: 1,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(micGlowOpacity, {
            toValue: 0.58,
            duration: 520,
            useNativeDriver: true,
          }),
          Animated.timing(micGlowOpacity, {
            toValue: 1,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voiceNativeEnabled, isListening, voiceTarget, recordingPulse, micGlowOpacity]);

  useEffect(() => {
    let isMounted = true;

    const loadLocation = async () => {
      if (DEV_LOCATION_OVERRIDE.toLowerCase() === 'germany') {
        if (isMounted) {
          setLocationContext('User is in Nürtingen, Germany');
          setRetailLocationHint('Nürtingen, Baden-Württemberg, Germany');
          setIsLocationLoading(false);
        }
        return;
      }

      if (Platform.OS === 'web') {
        setLocationContext('');
        setRetailLocationHint('');
        setIsLocationLoading(false);
        return;
      }

      if (isIosSimulatorRuntime()) {
        setLocationContext('');
        setRetailLocationHint('');
        setIsLocationLoading(false);
        return;
      }

      try {
        const Location = await import('expo-location') as NativeLocationModule;
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          if (isMounted) {
            setLocationContext('');
            setRetailLocationHint('');
            setIsLocationLoading(false);
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const places = await Location.reverseGeocodeAsync(position.coords);

        if (isMounted) {
          const place = places[0];
          setLocationContext(formatLocationContext(position.coords, place));
          setRetailLocationHint(formatRetailLocationHint(place));
        }
      } catch (error) {
        console.warn('Location lookup failed:', error);
        if (isMounted) {
          setLocationContext('');
          setRetailLocationHint('');
        }
      } finally {
        if (isMounted) setIsLocationLoading(false);
      }
    };

    void loadLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let isActive = true;

    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (isActive) setLanguage(parseStoredLanguage(storedLanguage));
      })
      .catch(console.warn);

    return () => {
      isActive = false;
    };
  }, []));

  useEffect(() => {
    console.log('NutriFlow Core Updated: Focus English/German, Voice Active, Memory Cleared');
  }, []);

  useEffect(() => {
    Promise.all([getRecentSupplements(12), getUserProgressProfile()])
      .then(([supplements, progress]) => {
        setTodaysSupplements(supplements);
        setTriggerMemories(progress.triggers);
      })
      .catch(console.warn);
  }, []);

  useEffect(() => () => {
    loadedVoiceModule?.destroy?.();
    loadedVoiceModule?.removeAllListeners?.();
    if (voiceNativeEnabled) {
      teardownExpoSpeechRecognition();
    }
  }, [voiceNativeEnabled]);

  useEffect(() => {
    if (!params.historyId) return;

    getPhotoAnalysisHistory(user?.id)
      .then((history) => {
        const savedAnalysis = history.find((item) => item.id === params.historyId);
        if (!savedAnalysis) return;

        setPhotoUri(savedAnalysis.imageUri);
        setLastImageBase64('');
        setAnalysis(savedAnalysis.aiText);
        setPlanBMessage('');
        setUserFeedback([]);
        setWizardStep(3);
        setAccuracyAnswer(null);
        setCorrectionDraft('');
        const savedUserSymptoms = savedAnalysis.symptoms.filter(
          (symptom) => !promptConditions.includes(symptom as MedicalCondition) && symptom !== 'General Gut Health'
        );
        const savedSymptomKeys = SYMPTOM_OPTIONS
          .filter((option) =>
            savedUserSymptoms.some((symptom) =>
              ([option.promptLabel, option.labels.en, option.labels.de, option.labels.fa] as string[]).includes(symptom)
            )
          )
          .map((option) => option.key);
        setSelectedSymptoms(savedSymptomKeys);
        setMealDescription(
          savedUserSymptoms
            .filter((symptom) =>
              !SYMPTOM_OPTIONS.some((option) =>
                ([option.promptLabel, option.labels.en, option.labels.de, option.labels.fa] as string[]).includes(symptom)
              )
            )
            .join(', ')
        );
      })
      .catch(console.warn);
  }, [params.historyId, user?.id]);

  const handleShareAnalysis = async () => {
    if (!analysis) return;

    try {
      const summary = [
        t.snapshotHeading,
        `${t.scoreLabel}: ${mealImpactScore ?? t.pendingScore}`,
        `${t.profileContext}`,
        '',
        analysis,
      ].join('\n');

      await Share.share({
        title: t.shareTitle,
        message: summary,
      });
    } catch (error) {
      console.error('Photo analysis share failed:', error);
      Alert.alert(t.shareErrorTitle, error instanceof Error ? error.message : t.shareErrorMessage);
    }
  };

  const handleLogPhotoAnalysis = async () => {
    if (!analysis) {
      return;
    }

    if (isGuest) {
      setToast({ visible: true, message: t.logMealLocal, type: 'success' });
      return;
    }

    if (!user) {
      setToast({ visible: true, message: t.loginRequired, type: 'error' });
      return;
    }

    const mealName = extractMealName(analysis).trim().slice(0, 200) || t.photoMealDefault;
    const scoreNote = mealImpactScore ? `${t.scoreLabel}: ${mealImpactScore}` : `${t.scoreLabel}: ${t.pendingScore}`;
    const payload = {
      user_id: user.id,
      meal_name: mealName,
      meal_type: getMealTypeForClock(),
      foods: null as string[] | null,
      note: `${scoreNote}. ${analysis.slice(0, 600)}`,
      logged_at: new Date().toISOString(),
    };

    setIsLoggingMeal(true);
    const { error } = await supabase.from('food_logs').insert(payload);
    setIsLoggingMeal(false);

    if (error) {
      if (
        error.message?.includes('network') ||
        error.message?.includes('Network') ||
        error.code === 'PGRST301' ||
        !error.code
      ) {
        await enqueue('food_logs', payload);
        setToast({ visible: true, message: t.logMealOffline, type: 'info' });
      } else {
        setToast({ visible: true, message: t.logMealFailed, type: 'error' });
      }
      return;
    }

    setToast({ visible: true, message: t.logMealSuccess, type: 'success' });
  };

  const toggleSymptom = (symptomKey: SymptomKey) => {
    setSelectedSymptoms((current) =>
      current.includes(symptomKey)
        ? current.filter((item) => item !== symptomKey)
        : [...current, symptomKey]
    );
  };

  const handleGenerateAnalysis = () => {
    if (!lastImageBase64.trim() || !photoUri) return;
    if (!hasAnalysisInput) {
      Alert.alert(t.feelingsRequiredTitle, t.feelingsRequiredMessage);
      return;
    }
    void runPhotoAnalysis(lastImageBase64, photoUri, analysisInputSummary);
  };

  const runPhotoAnalysis = async (
    imageBase64: string,
    uri: string,
    feelingsNarrative: string,
  ) => {
    setIsAnalyzing(true);
    setPhotoUri(uri);
    setLastImageBase64(imageBase64);
    setPlanBMessage('');
    setUserFeedback([]);

    try {
      const rawResult = await analyzeMealPhoto(imageBase64, 'image/jpeg', {
        preferredLanguage: language,
        conditions: promptConditions,
        symptoms: currentSymptoms,
        userEnteredSymptoms,
        supplementsTakenToday: todaysSupplements.map((item) => `${item.name} (${item.dosage}, ${item.time})`),
        triggerMemories: [],
        locationContext,
        retailLocationHint,
        userFeelingsNarrative: feelingsNarrative,
      });
      const dynamicResult = applyDynamicMealImpactScore(rawResult, currentSymptoms, feelingsNarrative, language);
      const dynamicMealImpactScore = resolveMealImpactScore(dynamicResult, currentSymptoms, feelingsNarrative, language);
      setAnalysis(dynamicResult);
      setResultsScrollKey((key) => key + 1);
      setWizardStep(3);
      setAccuracyAnswer(null);
      setCorrectionDraft('');
      await savePhotoAnalysisHistoryItem({
        imageUri: uri,
        aiText: dynamicResult,
        symptoms: currentSymptoms,
        mealImpactScore: dynamicMealImpactScore,
        language,
        userId: user?.id,
      });
      const xpResult = await addXpForAction(10);
      if (hasPainSymptom) {
        const progress = await recordTriggerFeedback({
          mealName: extractMealName(rawResult),
          adviceSummary: rawResult.slice(0, 240),
          symptoms: currentSymptoms,
        });
        setTriggerMemories(progress.triggers);
      }
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${xpResult.profile.rank}`);
        setTimeout(() => setRankUpBadge(''), 3600);
      }
    } catch (error) {
      console.error('Meal photo analysis failed:', error);
      Alert.alert(
        t.photoAnalysisFailedTitle,
        error instanceof Error ? error.message : t.photoAnalysisFailedTryAgain,
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const storeCapturedPhoto = (
    asset: ImagePicker.ImagePickerAsset,
    options: {
      mealDescription?: string;
      symptomKeys?: SymptomKey[];
      nextStep?: WizardStep;
    } = {},
  ) => {
    if (!asset.base64) {
      Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
      return;
    }
    // Listen-before-analyze: no Groq call here—only after Step 2 voice/text and Generate Analysis.
    setPhotoUri(asset.uri);
    setLastImageBase64(asset.base64);
    setAnalysis('');
    setPlanBMessage('');
    setUserFeedback([]);
    setWizardStep(options.nextStep ?? 1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
    setMealDescription(options.mealDescription ?? '');
    setSelectedSymptoms(options.symptomKeys ?? []);
  };

  const pickImageFileOnWeb = () => {
    if (typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const [, base64 = ''] = dataUrl.split(',');
        if (!base64) {
          Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
          return;
        }
        storeCapturedPhoto({
          uri: dataUrl,
          base64,
          width: 0,
          height: 0,
        } as ImagePicker.ImagePickerAsset);
      } catch (error) {
        console.error('Web image read failed:', error);
        Alert.alert(t.photoUnavailableTitle, t.photoUnavailableMessage);
      }
    };

    document.body.appendChild(input);
    input.click();
  };

  const selectDemoMeal = (demoMealKey: DemoMealKey) => {
    const demoMeal = DEMO_MEALS[demoMealKey];

    storeCapturedPhoto(
      {
        uri: demoMeal.imageUri,
        base64: demoMeal.imageBase64,
        width: 120,
        height: 90,
      } as ImagePicker.ImagePickerAsset,
      {
        mealDescription: demoMeal.note[language],
        symptomKeys: demoMeal.symptomKeys,
        nextStep: 2,
      },
    );
  };

  const takePhoto = async () => {
    if (isAnalyzing) return;

    if (Platform.OS === 'web') {
      pickImageFileOnWeb();
      return;
    }

    if (isCameraFallbackActive) {
      setCameraUnavailable(true);
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t.cameraNeededTitle, t.cameraNeededMessage);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.72,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        storeCapturedPhoto(result.assets[0]);
      }
    } catch (error) {
      console.warn('Camera unavailable, switching to simulator-safe demo flow:', error);
      setCameraUnavailable(true);
    }
  };

  const pickImage = async () => {
    if (isAnalyzing) return;

    if (Platform.OS === 'web') {
      pickImageFileOnWeb();
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t.libraryNeededTitle, t.libraryNeededMessage);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.72,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        storeCapturedPhoto(result.assets[0]);
      }
    } catch (error) {
      console.warn('Image picker failed:', error);
      Alert.alert(
        t.photoUnavailableTitle,
        error instanceof Error ? error.message : t.photoUnavailableMessage,
      );
    }
  };

  const submitChatCorrection = async (rawCorrection: string) => {
    const correction = rawCorrection.trim();
    if (!correction || !analysis || isCorrecting) return;
    const correctionIsDifferentFood = isDifferentFoodCorrection(correction);

    setIsCorrecting(true);

    try {
      const revisedAnalysis = await reviseMealAnalysis({
        preferredLanguage: language,
        previousAnalysis: correctionIsDifferentFood
          ? 'Previous meal context intentionally cleared because the user described a different food. Do not mention the old guessed food.'
          : [
            lastImageBase64 ? 'Photo context is still available from this scan.' : 'Photo context is from saved analysis text only.',
            analysis,
          ].join('\n\n'),
        correction,
        conditions: promptConditions,
        symptoms: [...currentSymptoms, correction],
        triggerMemories: formatTriggerMemories(triggerMemories),
        locationContext,
        retailLocationHint,
        priorUserCorrections: userFeedback,
      });
      const dynamicRevisedAnalysis = applyDynamicMealImpactScore(
        revisedAnalysis,
        [...currentSymptoms, correction],
        correction,
        language,
      );
      const correctedAnalysis = ensurePainApology(
        dynamicRevisedAnalysis,
        t.painApology,
        hasPainSymptom || hasPainText(correction)
      );
      setAnalysis(correctedAnalysis);
      setResultsScrollKey((key) => key + 1);
      setUserFeedback((prior) => [...prior, correction]);
      setAccuracyAnswer(null);
      if (correctionIsDifferentFood) {
        setPlanBMessage('');
      }
      const xpResult = await addXpForAction(5);
      if (xpResult.leveledUp) {
        setRankUpBadge(`${t.rankUp}: ${xpResult.profile.rank}`);
        setTimeout(() => setRankUpBadge(''), 3600);
      }

      if (hasPainSymptom || hasPainText(correction)) {
        const progress = await recordTriggerFeedback({
          mealName: extractMealName(correctedAnalysis),
          adviceSummary: correctedAnalysis.slice(0, 240),
          symptoms: [...currentSymptoms, correction],
        });
        setTriggerMemories(progress.triggers);
      }
      setCorrectionDraft('');
    } catch (error) {
      console.error('Meal correction failed:', error);
      Alert.alert(
        t.correctionFailedTitle,
        error instanceof Error ? error.message : t.correctionFailedTryAgain,
      );
    } finally {
      setIsCorrecting(false);
    }
  };

  const applyVoiceTranscript = (destination: 'feelings' | 'correction', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (destination === 'feelings') setMealDescription(trimmed);
    else setCorrectionDraft(trimmed);
  };

  const bindVoiceHandlers = (Voice: VoiceModule, destination: 'feelings' | 'correction') => {
    Voice.onSpeechResults = (event) => {
      const spokenText = event.value?.[0]?.trim();
      if (!spokenText || !voiceHoldActiveRef.current) return;
      latestTranscriptRef.current = spokenText;
      if (destination === 'correction') {
        setCorrectionDraft(spokenText);
      } else {
        setMealDescription(spokenText);
      }
    };
    Voice.onSpeechPartialResults = (event) => {
      const spokenText = event.value?.[0]?.trim();
      if (!spokenText || !voiceHoldActiveRef.current) return;
      latestTranscriptRef.current = spokenText;
      if (destination === 'correction') {
        setCorrectionDraft(spokenText);
      } else {
        setMealDescription(spokenText);
      }
    };
    Voice.onSpeechError = (err: unknown) => {
      voiceHoldActiveRef.current = false;
      voiceEngineRef.current = null;
      setIsListening(false);
      setVoiceTarget(null);
      if (parseRnVoiceError(err) === 'mic') {
        setToast({ visible: true, message: t.microphoneDisabledToast, type: 'info' });
      } else {
        setToast({ visible: true, message: t.voiceUnavailableMessage, type: 'info' });
      }
    };
  };

  const beginVoiceHold = async (destination: 'feelings' | 'correction') => {
    if (isListening || !voiceNativeEnabled) return;
    teardownExpoSpeechRecognition();
    expoSpeechStopRef.current = null;
    voiceEngineRef.current = null;

    voiceDestinationRef.current = destination;
    voiceHoldActiveRef.current = true;
    latestTranscriptRef.current = '';
    setVoiceTarget(destination);
    setIsListening(true);

    const locale = getVoiceLocale(language);
    const pushTranscript = (spokenText: string) => {
      if (!voiceHoldActiveRef.current) return;
      const next = spokenText.trim();
      if (!next) return;
      latestTranscriptRef.current = next;
      if (destination === 'correction') setCorrectionDraft(next);
      else setMealDescription(next);
    };

    const micToast = () =>
      setToast({ visible: true, message: t.microphoneDisabledToast, type: 'info' });
    const voiceToast = () =>
      setToast({ visible: true, message: t.voiceUnavailableMessage, type: 'info' });

    try {
      const Voice = await loadVoiceModule();
      if (Voice) {
        bindVoiceHandlers(Voice, destination);
        try {
          await Voice.start(locale);
          voiceEngineRef.current = 'rn-voice';
          return;
        } catch (rnStartErr) {
          console.warn('react-native-voice start failed; trying expo-speech-recognition:', rnStartErr);
          try {
            await Voice.stop?.();
          } catch {
            /* noop */
          }
          Voice.removeAllListeners?.();
        }
      }

      const stopExpo = await tryStartExpoSpeechRecognition(
        locale,
        pushTranscript,
        () => {
          voiceHoldActiveRef.current = false;
          setIsListening(false);
          setVoiceTarget(null);
          micToast();
        },
        () => {
          voiceHoldActiveRef.current = false;
          setIsListening(false);
          setVoiceTarget(null);
          voiceToast();
        },
      );

      if (!stopExpo) {
        voiceHoldActiveRef.current = false;
        setIsListening(false);
        setVoiceTarget(null);
        return;
      }

      expoSpeechStopRef.current = stopExpo;
      voiceEngineRef.current = 'expo-speech';
    } catch (error) {
      console.warn('Voice start failed:', error);
      voiceHoldActiveRef.current = false;
      setIsListening(false);
      setVoiceTarget(null);
      voiceToast();
    }
  };

  const finishVoiceHold = async () => {
    voiceHoldActiveRef.current = false;
    try {
      if (voiceEngineRef.current === 'expo-speech' && expoSpeechStopRef.current) {
        await expoSpeechStopRef.current();
      } else {
        await loadedVoiceModule?.stop?.();
      }
    } catch (error) {
      console.warn('Voice stop failed:', error);
    }
    expoSpeechStopRef.current = null;
    voiceEngineRef.current = null;

    const dest = voiceDestinationRef.current;
    const finalText = latestTranscriptRef.current.trim();
    if (finalText) applyVoiceTranscript(dest, finalText);
    latestTranscriptRef.current = '';
    setIsListening(false);
    setVoiceTarget(null);
  };

  const handleNewScan = () => {
    setPhotoUri(null);
    setLastImageBase64('');
    setAnalysis('');
    setPlanBMessage('');
    setRankUpBadge('');
    setMealDescription('');
    setSelectedSymptoms([]);
    setUserFeedback([]);
    setWizardStep(1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
    setTriggerMemories([]);
    setIsAnalyzing(false);
    setIsCorrecting(false);
  };

  const handleChangePhoto = () => {
    setPhotoUri(null);
    setLastImageBase64('');
    setAnalysis('');
    setMealDescription('');
    setSelectedSymptoms([]);
    setWizardStep(1);
    setAccuracyAnswer(null);
    setCorrectionDraft('');
  };

  const handleApplyCorrection = async () => {
    const trimmed = correctionDraft.trim();
    if (!trimmed) {
      setToast({ visible: true, message: t.recommendationUnchanged, type: 'info' });
      return;
    }
    await submitChatCorrection(trimmed);
  };

  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenBody}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            <Text style={styles.backButtonText}>{t.back}</Text>
          </Pressable>
          <View style={styles.headerTextBlock}>
            <Text style={[styles.title, isRtlLanguage && styles.rtlText]}>{t.title}</Text>
            <Text style={[styles.subtitle, isRtlLanguage && styles.rtlText]}>{wizardSubtitle}</Text>
          </View>
        </View>

        {wizardStep === 2 ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={90}
            style={styles.keyboardAvoidFill}
          >
            <ScrollView
              style={styles.scrollFlex}
              contentContainerStyle={[styles.content, styles.wizardStep2Content]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.wizardThumbnail} />
              ) : null}

              <Text style={[styles.step2PromptText, isRtlLanguage && styles.rtlText]}>{t.step2Prompt}</Text>

              {!voiceNativeEnabled ? (
                <View style={[styles.expoGoHintCard, isRtlLanguage && styles.rtlRow]}>
                  <Ionicons name="information-circle-outline" size={20} color={Colors.secondaryLight} />
                  <Text style={[styles.expoGoHintText, isRtlLanguage && styles.rtlText]}>{t.expoGoTextOnlyHint}</Text>
                </View>
              ) : null}

              {voiceNativeEnabled ? (
                <>
                  <View style={styles.wizardMicCenter}>
                    {canRecordFeelings && isListening && voiceTarget === 'feelings' ? (
                      <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
                        <Pressable
                          onPressIn={() => void beginVoiceHold('feelings')}
                          onPressOut={() => void finishVoiceHold()}
                          accessibilityRole="button"
                          accessibilityLabel={t.voiceInputA11yLabel}
                          accessibilityHint={t.voiceInputA11yHint}
                          accessibilityState={{ busy: true }}
                          style={({ pressed }) => [
                            styles.wizardMicLarge,
                            styles.micRecording,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Animated.View style={{ opacity: micGlowOpacity }}>
                            <Ionicons name="mic" size={34} color="#FFFFFF" />
                          </Animated.View>
                        </Pressable>
                      </Animated.View>
                    ) : (
                      <Pressable
                        disabled={!canRecordFeelings}
                        onPressIn={() => void beginVoiceHold('feelings')}
                        onPressOut={() => void finishVoiceHold()}
                        accessibilityRole="button"
                        accessibilityLabel={t.voiceInputA11yLabel}
                        accessibilityHint={t.voiceInputA11yHint}
                        accessibilityState={{ busy: false }}
                        style={({ pressed }) => [
                          styles.wizardMicLarge,
                          !canRecordFeelings && styles.wizardMicLargeDisabled,
                          pressed && canRecordFeelings && styles.pressed,
                        ]}
                      >
                        <Ionicons name="mic-outline" size={34} color="#FFFFFF" />
                      </Pressable>
                    )}
                  </View>

                  {canRecordFeelings && isListening && voiceTarget === 'feelings' ? (
                    <View style={[styles.recordingIndicatorInline, styles.wizardRecordingCenter, isRtlLanguage && styles.rtlRow]}>
                      <ActivityIndicator color="#EF4444" size="small" />
                      <Text style={[styles.correctingText, isRtlLanguage && styles.rtlText]}>{t.recording}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              <View style={styles.symptomSelectorCard}>
                <Text style={[styles.symptomsLabel, isRtlLanguage && styles.rtlText]}>
                  {t.symptomSelectorLabel}
                </Text>
                <Text style={[styles.symptomSelectorHint, isRtlLanguage && styles.rtlText]}>
                  {t.symptomSelectorHint}
                </Text>
                <View style={[styles.symptomChipWrap, isRtlLanguage && styles.rtlRow]}>
                  {SYMPTOM_OPTIONS.map((option) => {
                    const isSelected = selectedSymptoms.includes(option.key);
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => toggleSymptom(option.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        style={({ pressed }) => [
                          styles.symptomChip,
                          isSelected && styles.symptomChipSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.symptomChipText,
                            isSelected && styles.symptomChipTextSelected,
                          ]}
                        >
                          {option.labels[language]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <TextInput
                value={mealDescription}
                onChangeText={setMealDescription}
                placeholder={t.howYouFeelPlaceholder}
                placeholderTextColor={Colors.textTertiary}
                multiline
                textAlignVertical="top"
                style={[
                  styles.wizardFeelingsInput,
                  !voiceNativeEnabled && styles.wizardFeelingsInputExpoGo,
                  isRtlLanguage && styles.rtlText,
                ]}
              />

              <Pressable
                onPress={handleGenerateAnalysis}
                disabled={!hasAnalysisInput || isAnalyzing || !lastImageBase64.trim()}
                accessibilityRole="button"
                accessibilityLabel={t.generateAnalysis}
                accessibilityState={{
                  disabled: !hasAnalysisInput || isAnalyzing || !lastImageBase64.trim(),
                }}
                style={({ pressed }) => [
                  styles.analyzeCombinedButton,
                  (!hasAnalysisInput || isAnalyzing || !lastImageBase64.trim()) &&
                    styles.analyzeCombinedButtonDisabled,
                  pressed &&
                    hasAnalysisInput &&
                    !isAnalyzing &&
                    lastImageBase64.trim() &&
                    styles.pressed,
                ]}
              >
                <Ionicons name="sparkles" size={20} color="#000000" />
                <Text style={styles.analyzeCombinedButtonText}>{t.generateAnalysis}</Text>
              </Pressable>

              <Pressable onPress={handleChangePhoto} style={({ pressed }) => [styles.changePhotoLink, pressed && styles.pressed]}>
                <Text style={[styles.changePhotoLinkText, isRtlLanguage && styles.rtlText]}>{t.changePhoto}</Text>
              </Pressable>

              {isAnalyzing ? (
                <View style={styles.scanNotice}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={[styles.scanNoticeBrand, isRtlLanguage && styles.rtlText]}>{t.analyzingBrand}</Text>
                  <Text style={[styles.scanNoticeText, isRtlLanguage && styles.rtlText]}>{t.analyzing}</Text>
                </View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            key={
              wizardStep === 3 && analysis
                ? `analysis-${resultsScrollKey}`
                : `wizard-${wizardStep}`
            }
            style={styles.scrollFlex}
            contentContainerStyle={[
              styles.content,
              wizardStep === 3 && analysis ? styles.analysisResultsContent : undefined,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {wizardStep === 1 ? (
              <>
                {isCameraFallbackActive ? (
                  <View style={styles.cameraFallbackCard}>
                    <View style={[styles.demoModePill, isRtlLanguage && styles.rtlRow]}>
                      <Ionicons name="phone-portrait" size={14} color="#D8FBEA" />
                      <Text style={[styles.demoModePillText, isRtlLanguage && styles.rtlText]}>{t.demoMode}</Text>
                    </View>
                    <View style={[styles.cameraFallbackHeader, isRtlLanguage && styles.rtlRow]}>
                      <View style={styles.cameraFallbackIcon}>
                        <Ionicons name="camera-reverse-outline" size={24} color="#D8FBEA" />
                      </View>
                      <View style={styles.cameraFallbackCopy}>
                        <Text style={[styles.cameraFallbackTitle, isRtlLanguage && styles.rtlText]}>
                          {cameraFallbackTitle}
                        </Text>
                        <Text style={[styles.cameraFallbackText, isRtlLanguage && styles.rtlText]}>
                          {cameraFallbackMessage}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={isAnalyzing}
                      onPress={pickImage}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.galleryFallbackButton,
                        isRtlLanguage && styles.rtlRow,
                        pressed && !isAnalyzing && styles.pressed,
                      ]}
                    >
                      <Ionicons name="images" size={18} color="#000000" />
                      <Text style={[styles.galleryFallbackButtonText, isRtlLanguage && styles.rtlText]}>
                        {t.uploadImageFromGallery}
                      </Text>
                    </Pressable>
                    <Text style={[styles.demoMealSectionTitle, isRtlLanguage && styles.rtlText]}>
                      {t.useSampleMealImage}
                    </Text>
                    <Text style={[styles.demoMealHelper, isRtlLanguage && styles.rtlText]}>{t.demoMealHelper}</Text>
                    <View style={styles.demoMealGrid}>
                      {(Object.keys(DEMO_MEALS) as DemoMealKey[]).map((demoMealKey) => {
                        const demoMeal = DEMO_MEALS[demoMealKey];
                        return (
                          <Pressable
                            key={demoMealKey}
                            onPress={() => selectDemoMeal(demoMealKey)}
                            accessibilityRole="button"
                            style={({ pressed }) => [styles.demoMealCard, pressed && styles.pressed]}
                          >
                            <Image source={{ uri: demoMeal.imageUri }} style={styles.demoMealImage} />
                            <View style={[styles.demoMealCaptionRow, isRtlLanguage && styles.rtlRow]}>
                              <Ionicons name="sparkles" size={14} color="#2DCE89" />
                              <Text style={[styles.demoMealTitle, isRtlLanguage && styles.rtlText]}>
                                {demoMeal.title[language]}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionGrid}>
                    <Pressable
                      disabled={isAnalyzing}
                      onPress={takePhoto}
                      style={({ pressed }) => [
                        styles.photoActionButton,
                        styles.takePhotoButton,
                        isAnalyzing && styles.disabledButton,
                        pressed && !isAnalyzing && styles.pressed,
                      ]}
                    >
                      <View style={styles.photoActionIcon}>
                        <Ionicons name="camera" size={30} color={Colors.textInverse} />
                      </View>
                      <Text style={[styles.photoActionTitle, isRtlLanguage && styles.rtlText]}>{t.takePhoto}</Text>
                      <Text style={[styles.photoActionText, isRtlLanguage && styles.rtlText]}>{t.takePhotoText}</Text>
                    </Pressable>

                    <Pressable
                      disabled={isAnalyzing}
                      onPress={pickImage}
                      style={({ pressed }) => [
                        styles.photoActionButton,
                        styles.galleryButton,
                        isAnalyzing && styles.disabledButton,
                        pressed && !isAnalyzing && styles.pressed,
                      ]}
                    >
                      <View style={styles.photoActionIcon}>
                        <Ionicons name="images" size={30} color={Colors.textInverse} />
                      </View>
                      <Text style={[styles.photoActionTitle, isRtlLanguage && styles.rtlText]}>{t.chooseGallery}</Text>
                      <Text style={[styles.photoActionText, isRtlLanguage && styles.rtlText]}>{t.chooseGalleryText}</Text>
                    </Pressable>
                  </View>
                )}

                {photoUri ? <Image source={{ uri: photoUri }} style={styles.previewImage} /> : null}

                {photoUri && lastImageBase64 ? (
                  <Pressable
                    onPress={() => setWizardStep(2)}
                    disabled={isAnalyzing}
                    accessibilityRole="button"
                    accessibilityLabel={t.wizardNext}
                    style={({ pressed }) => [
                      styles.wizardNextButton,
                      isAnalyzing && styles.wizardNextButtonDisabled,
                      pressed && !isAnalyzing && styles.pressed,
                    ]}
                  >
                    <Text style={styles.wizardNextButtonText}>{t.wizardNext}</Text>
                    <Ionicons name="arrow-forward" size={22} color="#000000" />
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {wizardStep === 3 ? (
              <>
                <View style={[
                  styles.profileCard,
                  hasPainSymptom && styles.profilePainCard,
                  isRtlLanguage && styles.rtlRow,
                ]}>
                  <Ionicons
                    name={hasPainSymptom ? 'warning' : 'person-circle-outline'}
                    size={18}
                    color={hasPainSymptom ? '#F59E0B' : Colors.primary}
                  />
                  <Text style={[styles.profileText, isRtlLanguage && styles.rtlText]}>
                    {t.profileContext}
                  </Text>
                </View>

                <View style={styles.locationCard}>
                  <Ionicons name="location-outline" size={17} color={Colors.primary} />
                  <Text style={[styles.locationText, isRtlLanguage && styles.rtlText]}>
                    {isLocationLoading
                      ? t.findingLocation
                      : locationContext
                        ? `${t.usingLocation} ${locationContext}`
                        : t.locationUnavailable}
                  </Text>
                </View>

                {(isAnalyzing || isCorrecting) && analysis ? (
                  <View style={styles.scanNotice}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={[styles.scanNoticeBrand, isRtlLanguage && styles.rtlText]}>{t.analyzingBrand}</Text>
                    <Text style={[styles.scanNoticeText, isRtlLanguage && styles.rtlText]}>
                      {isCorrecting ? t.correcting : t.analyzing}
                    </Text>
                  </View>
                ) : null}

                {analysis ? (
                  <>
                  <View style={styles.resultCard}>
                    {rankUpBadge ? (
                      <View style={[styles.rankUpBadge, isRtlLanguage && styles.rtlRow]}>
                        <Ionicons name="trophy" size={15} color="#000000" />
                        <Text style={styles.rankUpBadgeText}>{rankUpBadge}</Text>
                      </View>
                    ) : null}
                    <View style={styles.resultHeader}>
                      <View style={[styles.resultTitleRow, isRtlLanguage && styles.rtlRow]}>
                        <Ionicons name="nutrition" size={20} color={Colors.secondary} />
                        <Text style={[styles.resultTitle, isRtlLanguage && styles.rtlText]}>{t.resultTitle}</Text>
                      </View>
                    </View>
                    {mealImpactScore ? (
                      <View style={[
                        styles.scoreBadge,
                        hasPainSymptom && styles.scorePainBadge,
                        isRtlLanguage && styles.rtlRow,
                      ]}>
                        <Ionicons name="speedometer" size={18} color={Colors.textInverse} />
                        <Text style={[styles.scoreBadgeLabel, isRtlLanguage && styles.rtlText]}>{t.scoreLabel}</Text>
                        <Text style={styles.scoreBadgeValue}>{mealImpactScore}</Text>
                      </View>
                    ) : null}
                    {analysisInsights.length > 0 ? (
                      <View style={styles.analysisInsightCard}>
                        <View style={[styles.analysisInsightHeader, isRtlLanguage && styles.rtlRow]}>
                          <View style={styles.analysisInsightIcon}>
                            <Ionicons name="analytics" size={17} color="#D8FBEA" />
                          </View>
                          <Text style={[styles.analysisInsightTitle, isRtlLanguage && styles.rtlText]}>
                            {t.analysisInsightTitle}
                          </Text>
                        </View>
                        <View style={styles.analysisInsightList}>
                          {analysisInsights.map((insight, index) => (
                            <View key={`${insight}-${index}`} style={[styles.analysisInsightItem, isRtlLanguage && styles.rtlRow]}>
                              <View style={styles.analysisInsightDot} />
                              <Text style={[styles.analysisInsightText, isRtlLanguage && styles.rtlText]}>
                                {insight}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    <Text style={[styles.resultText, isRtlLanguage && styles.rtlText]}>{displayAnalysisText}</Text>
                    {hasPainSymptom ? (
                      <View style={styles.instantReliefCard}>
                        <View style={[styles.instantReliefHeader, isRtlLanguage && styles.rtlRow]}>
                          <Ionicons name="medkit" size={18} color="#F59E0B" />
                          <Text style={[styles.instantReliefTitle, isRtlLanguage && styles.rtlText]}>
                            {t.instantReliefTitle}
                          </Text>
                        </View>
                        <Text style={[styles.instantReliefText, isRtlLanguage && styles.rtlText]}>
                          {t.instantReliefText}
                        </Text>
                      </View>
                    ) : null}
                    {planBMessage ? (
                      <View style={styles.planBCard}>
                        <View style={[styles.planBHeader, isRtlLanguage && styles.rtlRow]}>
                          <Ionicons name="shield-checkmark" size={18} color="#2DCE89" />
                          <Text style={[styles.planBTitle, isRtlLanguage && styles.rtlText]}>{t.planBTitle}</Text>
                        </View>
                        <Text style={[styles.planBText, isRtlLanguage && styles.rtlText]}>{planBMessage}</Text>
                      </View>
                    ) : null}
                    <View style={styles.medicalDisclaimerBox}>
                      <Text style={[styles.medicalDisclaimerText, isRtlLanguage && styles.rtlText]}>
                        {t.medicalDisclaimer}
                      </Text>
                    </View>
                    <View style={[styles.scientificSourceRow, isRtlLanguage && styles.rtlRow]}>
                      <Ionicons name="library-outline" size={13} color="#8CA99A" />
                      <Text style={[styles.scientificSourceText, isRtlLanguage && styles.rtlText]}>
                        {t.scientificSource}
                      </Text>
                    </View>

                    <View style={styles.resultActionsRow}>
                      <Pressable
                        disabled={isLoggingMeal}
                        onPress={() => void handleLogPhotoAnalysis()}
                        style={({ pressed }) => [
                          styles.logMealButton,
                          pressed && !isLoggingMeal && styles.pressed,
                          isLoggingMeal && styles.resultActionDisabled,
                        ]}
                      >
                        {isLoggingMeal ? (
                          <ActivityIndicator color="#52B788" size="small" />
                        ) : (
                          <Ionicons name="restaurant-outline" size={18} color="#52B788" />
                        )}
                        <Text style={styles.logMealButtonText}>{t.logMeal}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleShareAnalysis()}
                        style={({ pressed }) => [
                          styles.shareButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons name="share-outline" size={18} color="#000000" />
                        <Text style={styles.shareButtonText}>{t.share}</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.accuracySectionCard}>
                    <Text style={[styles.wizardStep4Hint, isRtlLanguage && styles.rtlText]}>{t.wizardStep4Hint}</Text>
                    <Text style={[styles.accuracyQuestion, isRtlLanguage && styles.rtlText]}>{t.isThisAccurate}</Text>
                    <View style={[styles.accuracyRow, isRtlLanguage && styles.rtlRow]}>
                      <Pressable
                        onPress={() => setAccuracyAnswer('yes')}
                        style={({ pressed }) => [
                          styles.accuracyChip,
                          accuracyAnswer === 'yes' && styles.accuracyChipSelectedYes,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.accuracyChipText,
                          accuracyAnswer === 'yes' && styles.accuracyChipTextSelected,
                        ]}>
                          {t.yes}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setAccuracyAnswer('no')}
                        style={({ pressed }) => [
                          styles.accuracyChip,
                          accuracyAnswer === 'no' && styles.accuracyChipSelectedNo,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.accuracyChipText,
                          accuracyAnswer === 'no' && styles.accuracyChipTextSelectedNo,
                        ]}>
                          {t.no}
                        </Text>
                      </Pressable>
                    </View>

                    {accuracyAnswer === 'no' ? (
                      <View style={styles.correctionBox}>
                        <View style={[styles.correctionInputRow, isRtlLanguage && styles.rtlRow]}>
                          <TextInput
                            value={correctionDraft}
                            onChangeText={setCorrectionDraft}
                            placeholder={t.correctionPlaceholder}
                            placeholderTextColor={Colors.textTertiary}
                            multiline
                            textAlignVertical="top"
                            style={[
                              styles.correctionInput,
                              !voiceNativeEnabled && styles.correctionInputExpoGoFull,
                              isRtlLanguage && styles.rtlText,
                            ]}
                          />
                          {voiceNativeEnabled ? (
                            isListening && voiceTarget === 'correction' ? (
                              <Animated.View style={{ transform: [{ scale: recordingPulse }] }}>
                                <Pressable
                                  onPressIn={() => void beginVoiceHold('correction')}
                                  onPressOut={() => void finishVoiceHold()}
                                  accessibilityRole="button"
                                  accessibilityLabel={t.voiceInputA11yLabel}
                                  accessibilityHint={t.voiceInputA11yHint}
                                  accessibilityState={{ busy: true }}
                                  disabled={isCorrecting}
                                  style={({ pressed }) => [
                                    styles.symptomsMicButton,
                                    styles.micRecording,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Animated.View style={{ opacity: micGlowOpacity }}>
                                    <Ionicons name="mic" size={20} color="#FFFFFF" />
                                  </Animated.View>
                                </Pressable>
                              </Animated.View>
                            ) : (
                              <Pressable
                                onPressIn={() => void beginVoiceHold('correction')}
                                onPressOut={() => void finishVoiceHold()}
                                accessibilityRole="button"
                                accessibilityLabel={t.voiceInputA11yLabel}
                                accessibilityHint={t.voiceInputA11yHint}
                                accessibilityState={{ busy: false }}
                                disabled={isCorrecting}
                                style={({ pressed }) => [styles.symptomsMicButton, pressed && styles.pressed]}
                              >
                                <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
                              </Pressable>
                            )
                          ) : null}
                        </View>
                        {voiceNativeEnabled && isListening && voiceTarget === 'correction' ? (
                          <View style={[styles.recordingIndicatorInline, isRtlLanguage && styles.rtlRow]}>
                            <ActivityIndicator color="#EF4444" size="small" />
                            <Text style={[styles.correctingText, isRtlLanguage && styles.rtlText]}>{t.recording}</Text>
                          </View>
                        ) : null}
                        <Pressable
                          disabled={isCorrecting}
                          onPress={() => void handleApplyCorrection()}
                          style={({ pressed }) => [
                            styles.applyCorrectionButton,
                            isCorrecting && styles.applyCorrectionButtonDisabled,
                            pressed && !isCorrecting && styles.pressed,
                          ]}
                        >
                          {isCorrecting ? (
                            <ActivityIndicator color="#000000" size="small" />
                          ) : (
                            <Text style={styles.applyCorrectionButtonText}>{t.applyCorrection}</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  </>
                ) : null}

                <View style={[styles.wizardFooterRow, { paddingBottom: Spacing.md + insets.bottom }]}>
                  <Pressable onPress={handleNewScan} style={({ pressed }) => [styles.newScanButton, pressed && styles.pressed]}>
                    <Ionicons name="scan" size={16} color="#2DCE89" />
                    <Text style={styles.newScanText}>{t.newScan}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = createStyles({
  container: {
    backgroundColor: '#000000',
    flex: 1,
  },
  screenBody: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoidFill: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  analysisResultsContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl * 3,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTextBlock: {
    flex: 1,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderColor: '#242424',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
  },
  subtitle: {
    color: '#A7A7A7',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  content: {
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: 0,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  profilePainCard: {
    backgroundColor: '#1B1205',
    borderColor: '#F59E0B66',
  },
  profileText: {
    color: '#D8FBEA',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  symptomsCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  symptomsLabel: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  symptomSelectorCard: {
    backgroundColor: 'rgba(45,206,137,0.08)',
    borderColor: 'rgba(45,206,137,0.28)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  symptomSelectorHint: {
    color: '#BEBEBE',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  symptomChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  symptomChip: {
    backgroundColor: '#111111',
    borderColor: '#2A2A2A',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  symptomChipSelected: {
    backgroundColor: '#2DCE89',
    borderColor: '#68F3B3',
  },
  symptomChipText: {
    color: '#D8D8D8',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  symptomChipTextSelected: {
    color: '#000000',
  },
  symptomsInput: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    minHeight: 76,
    padding: Spacing.md,
  },
  symptomsInputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  symptomsInputFlex: {
    flex: 1,
  },
  symptomsMicButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    marginBottom: 2,
    width: 42,
  },
  recordingIndicatorInline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm,
  },
  capturedCard: {
    backgroundColor: 'rgba(45,206,137,0.1)',
    borderColor: 'rgba(45,206,137,0.35)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  capturedPrompt: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  analyzeCombinedButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
  },
  analyzeCombinedButtonDisabled: {
    backgroundColor: '#2a3d34',
    opacity: 0.55,
  },
  analyzeCombinedButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  locationCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  locationText: {
    color: '#BEBEBE',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actionGrid: {
    gap: Spacing.md,
  },
  cameraFallbackCard: {
    backgroundColor: '#0F3D2E',
    borderColor: '#2DCE8966',
    borderRadius: 15,
    borderWidth: 1,
    gap: Spacing.md,
    padding: Spacing.lg,
    shadowColor: '#0F3D2E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 4,
  },
  demoModePill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2DCE8933',
    borderColor: '#7DD9A866',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  demoModePillText: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  cameraFallbackHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cameraFallbackIcon: {
    alignItems: 'center',
    backgroundColor: '#2DCE8940',
    borderRadius: 15,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  cameraFallbackCopy: {
    flex: 1,
  },
  cameraFallbackTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
  },
  cameraFallbackText: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  galleryFallbackButton: {
    alignItems: 'center',
    backgroundColor: '#DFF5EA',
    borderRadius: 15,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
  },
  galleryFallbackButtonText: {
    color: '#000000',
    flexShrink: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  demoMealHelper: {
    color: '#B7F7D6',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  demoMealSectionTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  demoMealGrid: {
    gap: Spacing.sm,
  },
  demoMealCard: {
    backgroundColor: '#F5FFF9',
    borderColor: '#7DD9A866',
    borderRadius: 15,
    borderWidth: 1,
    overflow: 'hidden',
  },
  demoMealImage: {
    aspectRatio: 4 / 3,
    width: '100%',
  },
  demoMealCaptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  demoMealTitle: {
    color: '#0F3D2E',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  photoActionButton: {
    borderRadius: BorderRadius.xl,
    minHeight: 156,
    overflow: 'hidden',
    padding: Spacing.lg,
    ...Shadows.md,
  },
  takePhotoButton: {
    backgroundColor: '#073D2B',
  },
  galleryButton: {
    backgroundColor: '#111111',
    borderColor: '#1E3B2F',
    borderWidth: 1,
  },
  photoActionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    height: 58,
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: 58,
  },
  photoActionTitle: {
    color: Colors.textInverse,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
  },
  photoActionText: {
    color: 'rgba(255,255,255,0.84)',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.md,
  },
  primaryButtonText: {
    color: Colors.textInverse,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  disabledButton: {
    backgroundColor: '#242424',
  },
  permissionTitle: {
    color: Colors.text,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    marginTop: Spacing.md,
  },
  permissionText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 23,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  scanNotice: {
    alignItems: 'center',
    backgroundColor: '#0B2618',
    borderColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'column',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  scanNoticeBrand: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    letterSpacing: 0.5,
  },
  scanNoticeText: {
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  previewImage: {
    borderRadius: BorderRadius.xl,
    height: 180,
    width: '100%',
  },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  rankUpBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  rankUpBadgeText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  resultTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    flexShrink: 1,
    gap: Spacing.sm,
  },
  resultShareButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  resultTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
  },
  scoreBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#102C20',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadows.sm,
  },
  scorePainBadge: {
    backgroundColor: '#F59E0B',
  },
  scoreBadgeLabel: {
    color: '#B7F7D6',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    opacity: 0.9,
  },
  scoreBadgeValue: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  analysisInsightCard: {
    backgroundColor: '#0F2D22',
    borderColor: '#2DCE8966',
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    shadowColor: '#2DCE89',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 3,
  },
  analysisInsightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  analysisInsightIcon: {
    alignItems: 'center',
    backgroundColor: '#2DCE8940',
    borderRadius: BorderRadius.full,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  analysisInsightTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  analysisInsightList: {
    gap: Spacing.sm,
  },
  analysisInsightItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  analysisInsightDot: {
    backgroundColor: '#7DD9A8',
    borderRadius: BorderRadius.full,
    height: 7,
    marginTop: 7,
    width: 7,
  },
  analysisInsightText: {
    color: '#D8FBEA',
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  instantReliefCard: {
    backgroundColor: '#1B1205',
    borderColor: '#F59E0B66',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  instantReliefHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  instantReliefTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  instantReliefText: {
    color: '#F5D9A8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  resultText: {
    color: '#F5F5F5',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 24,
  },
  planBCard: {
    backgroundColor: '#101010',
    borderColor: '#2DCE8944',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  planBHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  planBTitle: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  planBText: {
    color: '#D8D8D8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  medicalDisclaimerBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  medicalDisclaimerText: {
    color: '#B8B8B8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  scientificSourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.sm,
  },
  scientificSourceText: {
    color: '#8CA99A',
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  disagreeButton: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderColor: '#333333',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.lg,
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  disagreeButtonText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  resultActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  logMealButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(82,183,136,0.45)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  logMealButtonText: {
    color: '#E8FDF4',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  resultActionDisabled: {
    opacity: 0.65,
  },
  shareButton: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
  },
  shareButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  chatThread: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  chatBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    maxWidth: '88%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(45,206,137,0.18)',
    borderColor: 'rgba(45,206,137,0.32)',
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
  },
  chatBubbleText: {
    color: '#E8E8E8',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  chatBubbleUserText: {
    color: '#D8FBEA',
    fontFamily: FontFamily.sansMedium,
  },
  chatDock: {
    backgroundColor: 'rgba(8,8,8,0.88)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  chatDockHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  newScanButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,206,137,0.1)',
    borderColor: 'rgba(45,206,137,0.25)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  newScanText: {
    color: '#2DCE89',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  correctingPill: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
  },
  correctingText: {
    color: '#A7A7A7',
    flexShrink: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  chatInputRow: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  micRecording: {
    backgroundColor: '#DC2626',
  },
  chatInput: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    lineHeight: 24,
    maxHeight: 96,
    minHeight: 42,
    paddingHorizontal: Spacing.sm,
    paddingTop: 9,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.full,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  wizardStep2Content: {
    paddingBottom: Spacing.xl * 2,
  },
  accuracySectionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  wizardThumbnail: {
    alignSelf: 'center',
    borderRadius: BorderRadius.lg,
    height: 160,
    width: '100%',
  },
  step2PromptText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
  },
  expoGoHintCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(45,206,137,0.08)',
    borderColor: 'rgba(45,206,137,0.28)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  expoGoHintText: {
    color: '#D8FBEA',
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  wizardMicCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.sm,
  },
  wizardMicLarge: {
    alignItems: 'center',
    backgroundColor: 'rgba(45,206,137,0.35)',
    borderColor: 'rgba(45,206,137,0.65)',
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    height: 88,
    justifyContent: 'center',
    width: 88,
    ...Shadows.md,
  },
  wizardMicLargeDisabled: {
    opacity: 0.45,
  },
  wizardRecordingCenter: {
    alignSelf: 'center',
    justifyContent: 'center',
  },
  wizardFeelingsInput: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.md,
    minHeight: 120,
    padding: Spacing.md,
  },
  wizardFeelingsInputExpoGo: {
    minHeight: 152,
  },
  changePhotoLink: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    padding: Spacing.sm,
  },
  changePhotoLinkText: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  wizardNextButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  wizardNextButtonDisabled: {
    opacity: 0.55,
  },
  wizardNextButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  wizardFooterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: Spacing.md,
  },
  wizardStep4Hint: {
    color: '#888888',
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    marginBottom: Spacing.xs,
    marginTop: Spacing.lg,
  },
  accuracyQuestion: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  accuracyRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  accuracyChip: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.md,
  },
  accuracyChipSelectedYes: {
    backgroundColor: 'rgba(45,206,137,0.2)',
    borderColor: '#2DCE89',
  },
  accuracyChipSelectedNo: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: '#F87171',
  },
  accuracyChipText: {
    color: '#D0D0D0',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  accuracyChipTextSelected: {
    color: '#FFFFFF',
  },
  accuracyChipTextSelectedNo: {
    color: '#FECACA',
  },
  correctionBox: {
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  correctionInputRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  correctionInput: {
    backgroundColor: '#111111',
    borderColor: '#242424',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    color: '#FFFFFF',
    flex: 1,
    fontFamily: FontFamily.sansRegular,
    fontSize: FontSize.sm,
    minHeight: 72,
    padding: Spacing.sm,
  },
  correctionInputExpoGoFull: {
    minHeight: 96,
  },
  applyCorrectionButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#2DCE89',
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  applyCorrectionButtonDisabled: {
    opacity: 0.55,
  },
  applyCorrectionButtonText: {
    color: '#000000',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
});
