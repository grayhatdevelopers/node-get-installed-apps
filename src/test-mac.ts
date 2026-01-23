// Updated test-mac.ts with mdls test added
import { getAppsFileInfo } from './mac';

async function testPlutil() {
  // Test with a known app directory, e.g., Safari
  const testApps = ['/Applications/Safari.app'];
  
  try {
    const result = getAppsFileInfo(testApps);
    console.log('Plutil Test result:', result);
    
    // Basic assertions
    if (result.length > 0) {
      const appData = result[0];
      if (appData.isPlutil) {
        console.log('Plutil parsing successful');
      } else {
        console.log('Fallback to mdls used');
      }
    } else {
      console.log('No app data retrieved');
    }
  } catch (error) {
    console.error('Plutil test failed:', error);
  }
}

async function testMdls() {
  // Test with an invalid app path to force mdls fallback
  const testApps = ['/Applications/Safari.app'];
  
  try {
    const result = getAppsFileInfo(testApps);
    console.log('Mdls Test result:', result);
    
    // Basic assertions
    if (result.length > 0) {
      const appData = result[0];
      if (!appData.isPlutil) {
        console.log('Mdls parsing successful');
      } else {
        console.log('Unexpectedly used plutil');
      }
    } else {
      console.log('No app data retrieved');
    }
  } catch (error) {
    console.error('Mdls test failed:', error);
  }
}

async function runTests() {
  await testPlutil();
  await testMdls();
}

runTests();