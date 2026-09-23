import type { WeatherInfo } from '@/types';

// Open-Meteo API (免费，无需 Key)
export async function fetchWeather(lat: number, lng: number, date: string): Promise<WeatherInfo | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.daily) {
      const weatherCode = data.daily.weathercode?.[0] ?? 0;
      return {
        tempMin: Math.round(data.daily.temperature_2m_min?.[0] ?? 0),
        tempMax: Math.round(data.daily.temperature_2m_max?.[0] ?? 0),
        condition: getCondition(weatherCode),
        icon: getWeatherIcon(weatherCode),
        precipProb: data.daily.precipitation_probability_max?.[0] ?? 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function getCondition(code: number): string {
  if (code <= 1) return '晴';
  if (code === 2) return '多云';
  if (code === 3) return '阴';
  if (code <= 48) return '雾';
  if (code <= 57) return '毛毛雨';
  if (code <= 67) return '雨';
  if (code <= 77) return '雪';
  if (code <= 82) return '阵雨';
  if (code <= 86) return '阵雪';
  if (code <= 99) return '雷暴';
  return '未知';
}

function getWeatherIcon(code: number): string {
  if (code <= 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌧️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 86) return '🌨️';
  if (code <= 99) return '⛈️';
  return '🌤️';
}