# Auto-deploy GitHub → VPS

Цель: после каждого `git push` в ветку `main` GitHub Actions заходит на VPS, обновляет проект, собирает фронт и перезапускает сайт.

## 1. Что уже добавлено в репозиторий

- `.github/workflows/deploy.yml` — GitHub Actions workflow.
- `scripts/deploy.sh` — локальный deploy-скрипт для ручного запуска на VPS.

## 2. Подготовить папку проекта на VPS

Выберите постоянную папку, например:

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www

git clone https://github.com/alyonaveber73-glitch/strategist-marketplaces.git
cd strategist-marketplaces
npm install
npm run build
```

Если проект уже лежит в другой папке — используйте её как `APP_DIR` в GitHub Secrets.

## 3. Создать systemd-сервис на VPS

Создайте файл:

```bash
sudo nano /etc/systemd/system/strategist-marketplaces.service
```

Вставьте, заменив `USER_NAME` на пользователя VPS и путь при необходимости:

```ini
[Unit]
Description=Strategist Marketplaces site
After=network.target

[Service]
Type=simple
User=USER_NAME
WorkingDirectory=/var/www/strategist-marketplaces
Environment=NODE_ENV=production
Environment=PORT=80
ExecStart=/usr/bin/npm run dev:server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Примените:

```bash
sudo systemctl daemon-reload
sudo systemctl enable strategist-marketplaces
sudo systemctl restart strategist-marketplaces
sudo systemctl status strategist-marketplaces --no-pager
```

Проверка:

```bash
curl -I http://strateg-marketplaces.ru/
```

## 4. Дать пользователю право рестартить только этот сервис без пароля

GitHub Actions не сможет ввести пароль для `sudo`. Разрешите только рестарт/статус этого сервиса.

```bash
sudo visudo -f /etc/sudoers.d/strategist-marketplaces
```

Вставьте, заменив `USER_NAME`:

```text
USER_NAME ALL=(root) NOPASSWD: /bin/systemctl restart strategist-marketplaces, /bin/systemctl status strategist-marketplaces, /usr/bin/systemctl restart strategist-marketplaces, /usr/bin/systemctl status strategist-marketplaces
```

## 5. Создать SSH-ключ для деплоя

На своём компьютере или на VPS:

```bash
ssh-keygen -t ed25519 -C "github-actions-strategist-marketplaces" -f deploy_key
```

Публичный ключ `deploy_key.pub` добавьте на VPS в:

```bash
mkdir -p ~/.ssh
cat deploy_key.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Приватный ключ `deploy_key` добавьте в GitHub Secrets как `VPS_SSH_KEY`.

## 6. Добавить GitHub Secrets

В GitHub: repository → Settings → Secrets and variables → Actions → New repository secret.

Обязательные:

- `VPS_HOST` — IP сервера, например `2.25.206.58`.
- `VPS_USER` — пользователь VPS, например `root` или ваш пользователь.
- `VPS_SSH_KEY` — приватный SSH-ключ целиком.

Опциональные:

- `VPS_PORT` — если SSH не на 22 порту.
- `APP_DIR` — путь к проекту, если не `/var/www/strategist-marketplaces`.
- `SERVICE_NAME` — если сервис называется не `strategist-marketplaces`.

## 7. Проверить автодеплой

После добавления секретов сделайте любой commit/push в `main` или запустите workflow вручную: Actions → Deploy to VPS → Run workflow.

Проверка после деплоя:

```bash
curl -s http://strateg-marketplaces.ru/ | grep -o 'index-[^" ]*' | head
```

## 8. Ручной деплой на VPS

Если нужно обновить вручную:

```bash
cd /var/www/strategist-marketplaces
APP_DIR=/var/www/strategist-marketplaces SERVICE_NAME=strategist-marketplaces bash scripts/deploy.sh
```
