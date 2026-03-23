# SmartField Demo — Ruby Server
# Run: ruby ruby_server.rb
# Port: 9999

require 'webrick'
require 'json'
require 'openssl'
require 'base64'
require 'fileutils'

KEYS_DIR = File.join(__dir__, '.smartfield-ruby')
COMPONENT_DIR = File.expand_path('../../../component', __dir__)

$private_key = nil
$public_key_jwk = nil

def init_keys
  FileUtils.mkdir_p(KEYS_DIR)
  priv_path = File.join(KEYS_DIR, 'private.pem')
  pub_path = File.join(KEYS_DIR, 'public.json')

  if File.exist?(priv_path) && File.exist?(pub_path)
    $private_key = OpenSSL::PKey::RSA.new(File.read(priv_path))
    $public_key_jwk = JSON.parse(File.read(pub_path))
    puts "[SmartField] Keys loaded from #{KEYS_DIR}"
    return
  end

  # Generate new RSA-2048
  $private_key = OpenSSL::PKey::RSA.new(2048)
  File.write(priv_path, $private_key.to_pem)
  File.chmod(0600, priv_path)

  # Build JWK
  pub = $private_key.public_key
  n_bytes = pub.n.to_s(2) # big-endian binary
  e_bytes = pub.e.to_s(2)

  $public_key_jwk = {
    'kty' => 'RSA',
    'alg' => 'RSA-OAEP-256',
    'ext' => true,
    'key_ops' => ['encrypt'],
    'n' => Base64.urlsafe_encode64(n_bytes).gsub('=', ''),
    'e' => Base64.urlsafe_encode64(e_bytes).gsub('=', '')
  }

  File.write(pub_path, JSON.pretty_generate($public_key_jwk))
  puts "[SmartField] New keys generated in #{KEYS_DIR}"
end

def smartfield_decrypt(encrypted)
  return encrypted if encrypted.nil? || encrypted.length < 50

  payload = JSON.parse(Base64.decode64(encrypted))
  iv = Base64.decode64(payload['iv'])
  enc_key = Base64.decode64(payload['key'])
  enc_data = Base64.decode64(payload['data'])

  # RSA-OAEP decrypt AES key
  aes_key = $private_key.private_decrypt(
    enc_key,
    OpenSSL::PKey::RSA::PKCS1_OAEP_PADDING
  )

  # AES-256-GCM decrypt
  # GCM tag is last 16 bytes
  tag = enc_data[-16..]
  ciphertext = enc_data[0...-16]

  decipher = OpenSSL::Cipher::AES.new(256, :GCM)
  decipher.decrypt
  decipher.key = aes_key
  decipher.iv = iv
  decipher.auth_tag = tag

  decrypted = decipher.update(ciphertext) + decipher.final
  decrypted.force_encoding('UTF-8')
end

init_keys

server = WEBrick::HTTPServer.new(
  Port: 9999,
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO),
  AccessLog: [],
  RequestCallback: proc { |req, res|
    res['Access-Control-Allow-Origin'] = '*'
    res['Access-Control-Allow-Headers'] = 'Content-Type'
    res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  }
)

def add_cors(res)
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Headers'] = 'Content-Type'
  res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
end

# Serve public key
server.mount_proc '/sf-key' do |req, res|
  add_cors(res)
  if req.request_method == 'OPTIONS'
    res.status = 204
    next
  end
  res['Content-Type'] = 'application/json'
  res.body = $public_key_jwk.to_json
end

# Serve component
server.mount('/component', WEBrick::HTTPServlet::FileHandler, COMPONENT_DIR)

# Health
server.mount_proc '/health' do |req, res|
  res['Access-Control-Allow-Origin'] = '*'
  res['Content-Type'] = 'application/json'
  res.body = { server: 'Ruby (WEBrick)', status: 'ok', port: 9999 }.to_json
end

# Login
server.mount_proc '/login' do |req, res|
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Headers'] = 'Content-Type'
  res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  res['Content-Type'] = 'application/json'

  if req.request_method == 'OPTIONS'
    res.status = 204
    next
  end

  data = JSON.parse(req.body || '{}')
  decrypted = {}

  data.each do |key, value|
    if key == 'normalPwd'
      decrypted[key] = value
      puts "[Ruby]   #{key}: \"#{value}\" <- PLAIN TEXT"
    elsif value.is_a?(String) && value.length > 50
      begin
        decrypted[key] = smartfield_decrypt(value)
        puts "[Ruby]   #{key}: \"#{decrypted[key]}\" <- DECRYPTED"
      rescue => e
        decrypted[key] = "[decrypt failed: #{e.message}]"
        puts "[Ruby]   #{key}: FAILED - #{e.message}"
      end
    else
      decrypted[key] = value
    end
  end

  res.body = {
    server: 'Ruby (WEBrick)',
    status: 'ok',
    decrypted: decrypted,
    note: 'Decrypted with Ruby OpenSSL (RSA-OAEP + AES-256-GCM)'
  }.to_json
end

puts "\n  SmartField Ruby Demo Server"
puts "  http://localhost:9999"
puts "  Key: http://localhost:9999/sf-key\n"

trap('INT') { server.shutdown }
server.start
