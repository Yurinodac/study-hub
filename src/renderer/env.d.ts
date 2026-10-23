import type { StudyHubApi } from '../preload/index'

declare global {
  interface Window {
    studyHub: StudyHubApi
  }
}

export {}
