# SmartField Server SDK for Ruby
#
# Usage:
#   require 'smartfield'
#   sf = SmartField.new
#   sf.init
#
#   # Rails controller
#   class AuthController < ApplicationController
#     def public_key
#       render json: sf.get_public_key
#     end
#
#     def login
#       email = sf.decrypt(params[:email])
#       password = sf.decrypt(params[:password])
#     end
#   end

require 'openssl'
require 'json'
require 'base64'
require 'fileutils'

class SmartField
  def initialize
    @private_key = nil
    @public_key = nil
    @public_key_jwk = nil
    @keys_dir = nil
  end

  def init(keys_dir = '.smartfield')
    @keys_dir = keys_dir
    priv_path = File.join(keys_dir, 'private.pem')
    pub_path = File.join(keys_dir, 'public.json')

    if File.exist?(priv_path) && File.exist?(pub_path)
      @private_key = OpenSSL::PKey::RSA.new(File.read(priv_path))
      @public_key = @private_key.public_key
      @public_key_jwk = JSON.parse(File.read(pub_path))
      puts "[SmartField] Keys loaded from #{keys_dir}"
      return
    end

    # Generate new keys
    @private_key = OpenSSL::PKey::RSA.new(2048)
    @public_key = @private_key.public_key

    FileUtils.mkdir_p(keys_dir)

    # Save private key
    File.write(priv_path, @private_key.to_pem)
    File.chmod(0600, priv_path)

    # Save public key as JWK
    @public_key_jwk = key_to_jwk(@public_key)
    File.write(pub_path, JSON.pretty_generate(@public_key_jwk))

    # Add to .gitignore
    gitignore = File.join(Dir.pwd, '.gitignore')
    if File.exist?(gitignore) && !File.read(gitignore).include?('.smartfield')
      File.open(gitignore, 'a') { |f| f.puts "\n# SmartField keys\n.smartfield/" }
    end

    puts "[SmartField] New keys generated in #{keys_dir}"
  end

  def get_public_key
    raise '[SmartField] Not initialized. Call init first.' unless @public_key_jwk
    @public_key_jwk
  end

  def decrypt(encrypted_payload)
    raise '[SmartField] Not initialized. Call init first.' unless @private_key
    return '' if encrypted_payload.nil? || encrypted_payload.empty?

    payload = JSON.parse(Base64.decode64(encrypted_payload))

    iv = Base64.decode64(payload['iv'])
    encrypted_key = Base64.decode64(payload['key'])
    encrypted_data = Base64.decode64(payload['data'])

    # Decrypt AES key with RSA-OAEP
    aes_key_raw = @private_key.private_decrypt(
      encrypted_key,
      OpenSSL::PKey::RSA::PKCS1_OAEP_PADDING
    )

    # Decrypt data with AES-256-GCM
    decipher = OpenSSL::Cipher::AES.new(256, :GCM)
    decipher.decrypt
    decipher.key = aes_key_raw
    decipher.iv = iv

    # GCM tag is last 16 bytes
    tag_length = 16
    decipher.auth_tag = encrypted_data[-tag_length..]
    ciphertext = encrypted_data[0...-tag_length]

    decrypted = decipher.update(ciphertext) + decipher.final
    decrypted
  rescue => e
    raise "[SmartField] Decryption failed: #{e.message}"
  end

  def decrypt_fields(data)
    raise '[SmartField] Not initialized. Call init first.' unless @private_key

    result = {}
    data.each do |key, value|
      if value.is_a?(String) && value.length > 50
        begin
          result[key] = decrypt(value)
        rescue
          result[key] = value
        end
      else
        result[key] = value
      end
    end
    result
  end

  private

  def key_to_jwk(public_key)
    {
      'kty' => 'RSA',
      'alg' => 'RSA-OAEP-256',
      'ext' => true,
      'key_ops' => ['encrypt'],
      'n' => base64_url_encode(public_key.n.to_s(2)),
      'e' => base64_url_encode(public_key.e.to_s(2))
    }
  end

  def base64_url_encode(data)
    Base64.urlsafe_encode64(data).gsub('=', '')
  end
end
