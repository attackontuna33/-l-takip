# Damla'nın İlaç Takibi — iPhone Web Push paketi

Bu paket, mevcut statik PWA'yı Cloudflare Worker + D1 + Web Push ile çalışacak şekilde genişletir. Mevcut mor/lale tasarımı korunmuştur.

## Önemli
- iPhone'da iOS 16.4+ ve Safari'den **Ana Ekrana Ekle** ile kurulmuş web uygulaması gerekir.
- Bildirim izni, ana ekrandaki uygulama açıldıktan sonra **Bildirimleri aç** düğmesine basılarak verilmelidir.
- Cron her dakika çalışır. İlaç saati geçtikten sonra, ilaç “Aldım” olarak işaretlenene kadar en fazla 4 bildirim gönderir. Tekrar aralığı ilaç ekleme ekranında dakika olarak ayarlanır. 0 girilirse yalnızca ilk bildirim gönderilir.
- Bu bir ilaç takip aracıdır; doz/kullanım önerisi vermez. Kullanım planını doktor/eczacı belirlemelidir.
- İlk kurulumda Cloudflare Worker ve D1 yapılandırması gerekir. ZIP'i sadece mevcut statik dosyaların yanına koymak tek başına yetmez.

## 1. Dosyaları GitHub'a ekle
Bu paketin içindeki `public/` klasörünü olduğu gibi GitHub deposunun köküne yükle. `public` klasörünün içinde index.html, sw.js, manifest.webmanifest ve icon.svg bulunmalı. `worker.js`, `wrangler.toml`, `package.json` ve `schema.sql` dosyaları ise depo kökünde kalmalı. `wrangler.toml` zaten `./public` klasörünü kullanacak şekilde ayarlanmıştır.

## 2. D1 veritabanı oluştur
Cloudflare Dashboard → Storage & databases → D1 SQL Database → Create database.
Adı: `damla-ilac-db`.
Bu pakette Database ID, oluşturduğun `damla-ilac-db` veritabanına göre doldurulmuştur. Başka bir veritabanı oluşturursan ID'yi `wrangler.toml` içinden güncelle.
D1 Console'da `schema.sql` içeriğini çalıştır.

## 3. VAPID anahtarlarını oluştur
Bilgisayarda Node.js kuruluysa terminalde:
```bash
npm install
npx web-push generate-vapid-keys
```
Çıkan Public Key ve Private Key değerlerini sakla. Private Key'i kimseyle paylaşma.

## 4. Worker secrets ekle
Cloudflare Dashboard → Workers & Pages → Create → Worker (veya yeni Worker projesi) ve GitHub repo ile bağla / Wrangler ile deploy et.
Terminalde repo klasöründe:
```bash
npm install
npx wrangler secret put APP_TOKEN
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```
APP_TOKEN için uzun ve tahmin edilmesi zor bir parola belirle. VAPID_SUBJECT için `mailto:senin-adresin@example.com` biçiminde kendi e-posta adresini kullan.
Deploy:
```bash
npx wrangler deploy
```
Bu Worker'ın `*.workers.dev` veya bağladığın özel alan adı URL'sini kullan.

## 5. Uygulamayı aç ve bağla
Worker URL'sini iPhone'da Safari ile aç. Paylaş → Ana Ekrana Ekle. Ana ekrandaki simgeden aç.
- “Sunucu bağlantısı” düğmesine bas.
- APP_TOKEN değerini gir.
- “Bildirimleri aç” düğmesine bas ve iOS bildirim iznini onayla.
- İlaçları ekle. Saatler telefonun saat dilimine göre kaydedilir.
Aynı APP_TOKEN ile ikinci cihaz da bağlanabilir.

## 6. Mevcut URL / mevcut Worker hakkında
Mevcut `gentle-wood-2451.attackontuna33.workers.dev` statik Worker'ına bu paketi doğrudan yükleyip mevcut dosyaların üzerine yazma. Önce ayrı Worker olarak deploy edip test et. Test başarılı olduktan sonra mevcut alan adını/route'u yeni Worker'a taşıyabilirsin. Bu sayede çalışan sürümün yedeği korunur.

## Güvenlik ve veri
- APP_TOKEN, VAPID_PRIVATE_KEY ve Cloudflare erişim token'larını asla GitHub'a commit etme.
- İlaç isimleri ve saatleri D1'de saklanır. Bu nedenle yalnızca güvendiğin cihazlara APP_TOKEN gir.
- Web Push abonelik uç noktaları ve anahtarları veritabanında saklanır.
- Uygulama aynı token'ı bilen kişilerin ortak ilaç listesini gösterir; kullanıcı bazlı ayrı hesap sistemi bu ilk sürümde yoktur.

## Sorun giderme
- `/api/config` yanıtında `vapidPublicKey: null` görünüyorsa VAPID secrets eklenmemiştir.
- 401: APP_TOKEN yanlış.
- Push gelmiyorsa iPhone'da ana ekrana eklenmiş web uygulamasını açıp Bildirimleri aç düğmesine tekrar bas; iOS Ayarlar → Bildirimler bölümünü de kontrol et.
- Cron trigger ilk eklendiğinde etkinleşmesi birkaç dakika sürebilir.
