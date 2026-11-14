# Records the TrustVault narration with a Windows male voice.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File demo-voice\make-voice.ps1
Add-Type -AssemblyName System.Speech
$out = $PSScriptRoot
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$voices | ForEach-Object { "$($_.Name) | $($_.Gender) | $($_.Culture)" } | Set-Content "$out\voices.txt"
$pick = $voices | Where-Object { $_.Name -match 'David|Guy|Mark|Andrew|Christopher' } | Select-Object -First 1
if (-not $pick) { $pick = $voices | Where-Object { $_.Gender -eq 'Male' } | Select-Object -First 1 }
if (-not $pick) { Write-Host "No male voice found. Send Claude the file demo-voice\voices.txt"; exit 1 }
$s.SelectVoice($pick.Name)
$s.Rate = 0
$s.Volume = 100
Write-Host "Using voice: $($pick.Name)"
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$lines = @(
  @('c01','A.I. agents are getting more autonomous.'),
  @('c02','But who controls their actions?'),
  @('c03','This is Trust Vault.'),
  @('c04','An owner authorizes an agent to send zero point two near to an approved vendor.'),
  @('c05','Then a malicious instruction, hidden in content the agent reads, redirects the same amount to a different address.'),
  @('c06','It is within the spending limit, but outside the owner''s intent.'),
  @('c07','Trust Vault is an intent based security layer for A.I. agents on near.'),
  @('c08','The owner signs an Intent Capsule: the approved agent, operation, asset, recipient, a per payment limit, a total limit, an expiry, and a nonce.'),
  @('c09','When the agent asks to pay, the smart contract checks the request against the capsule.'),
  @('c10','If every field matches, the payment is approved.'),
  @('c11','If anything changed, it is blocked, recorded on chain, and explained.'),
  @('c12','The contract decides. The type script engine only mirrors the checks for previews.'),
  @('c13','We ran eight scenarios against the deployed contract on near test net.'),
  @('c14','An authorized payment is approved.'),
  @('c15','A prompt injection steers the agent to a different asset. Under the limit, but blocked.'),
  @('c16','Wrong recipient, blocked. Inflated amount, blocked. Replayed nonce, blocked. Wrong operation, blocked.'),
  @('c17','An expired capsule and a revoked agent are rejected.'),
  @('c18','Trust Vault doesn''t just check how much an agent can spend. It checks whether the agent is doing what its owner authorized.'),
  @('c19','The contract is written in Rust and runs on near test net.'),
  @('c20','Every decision is recorded on chain, so anyone can verify it. No language model takes part in an authorization decision.'),
  @('c21','Your A.I. can act.'),
  @('c22','Trust Vault makes sure it acts on your instructions.'),
  @('c23','Intent based security for A.I. agents. Built on near.')
)
foreach ($l in $lines) {
  $s.SetOutputToWaveFile("$out\$($l[0]).wav", $fmt)
  $s.Speak($l[1])
  Write-Host "Recorded $($l[0])"
}
$s.SetOutputToNull()
$s.Dispose()
Write-Host ""
Write-Host "DONE. 23 voice files are in the demo-voice folder. Tell Claude: done"
