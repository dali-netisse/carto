function pointsAreClose(p1, p2, threshold = 0.4) {
  const dx = Math.abs(p1[0] - p2[0]);
  const dy = Math.abs(p1[1] - p2[1]);
  console.log(`dx: ${dx}, dy: ${dy}, both <= ${threshold}: ${dx <= threshold && dy <= threshold}`);
  return dx <= threshold && dy <= threshold;
}

const p11 = [78.393, 244.373];
const p12 = [78.141, 244.523]; 
const p13 = [78.052, 244.740];

console.log('p11 to p12:');
console.log('Should filter:', pointsAreClose(p11, p12, 0.4));
console.log('');
console.log('p11 to p13:');
console.log('Should filter:', pointsAreClose(p11, p13, 0.4));
console.log('');
console.log('p12 to p13:');
console.log('Should filter:', pointsAreClose(p12, p13, 0.4));

// Test the Perl logic
console.log('\nPerl logic test:');
console.log('Perl keeps if dx > threshold OR dy > threshold');
function perlKeepsPoint(p1, p2, threshold = 0.4) {
  const dx = Math.abs(p1[0] - p2[0]);
  const dy = Math.abs(p1[1] - p2[1]);
  const keep = dx > threshold || dy > threshold;
  console.log(`dx: ${dx}, dy: ${dy}, dx > ${threshold}: ${dx > threshold}, dy > ${threshold}: ${dy > threshold}, keep: ${keep}`);
  return keep;
}

console.log('p11 to p12 - Perl would keep:');
console.log(perlKeepsPoint(p11, p12, 0.4));
console.log('');
console.log('p11 to p13 - Perl would keep:');
console.log(perlKeepsPoint(p11, p13, 0.4));
