// Updated test-mac.ts with mdls test added
import { getAppsFileInfo, getInstalledApps, parsePlutilData } from '../mac';

async function test() {
  // Test with a known app directory, e.g., Calculator
  const testApps = ['/Applications/Safari.app'];
  
  try {
    const result = await getAppsFileInfo(testApps);
    console.log('Test result:', result);
  } catch (error) {
    console.error('Test failed:', error);
  } 
}



async function testAllApps() {
  try {
    const allApps = await getInstalledApps('/Applications') as any[];
    console.log('All Apps Test result count:', allApps.length);
    
    // Basic assertion: should retrieve info for multiple apps
    if (allApps.length > 10) {
      console.log('Successfully retrieved info for multiple apps');
    } else {
      console.log('Unexpectedly low number of apps retrieved');
    }
  } catch (error) {
    console.error('All Apps test failed:', error);
  }
}

async function testPlutil() {
  const testApps = ['/Applications/Safari.app'];
  
  try {
    const result = await parsePlutilData(testApps);
    console.log('Plutil test result:', result);
  } catch (error) {
    console.error('Plutil test failed:', error);
  }
}
async function runTests() {
  console.log('--- Running existing tests ---');
  await test();
  
  console.log('\n--- Running new scan all apps test ---');

  console.log('\n--- Running plutil test ---');
  await testPlutil();
  await testAllApps();

}

runTests();
