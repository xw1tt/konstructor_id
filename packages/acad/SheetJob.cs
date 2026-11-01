// Данные листа схемы с сервера Конструктора ИД (GET /api/acad/sheet): ведомость и основная надпись.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Idk.Acad
{
    [DataContract]
    public class SheetRow
    {
        [DataMember(Name = "n")] public int N { get; set; }
        [DataMember(Name = "name")] public string Name { get; set; }
        [DataMember(Name = "mark")] public string Mark { get; set; }
        [DataMember(Name = "supplier")] public string Supplier { get; set; }
        [DataMember(Name = "unit")] public string Unit { get; set; }
        [DataMember(Name = "quantity")] public double Quantity { get; set; }
        [DataMember(Name = "note")] public string Note { get; set; }
    }

    [DataContract]
    public class Signer
    {
        [DataMember(Name = "role")] public string Role { get; set; }
        [DataMember(Name = "name")] public string Name { get; set; }
    }

    [DataContract]
    public class SheetJob
    {
        [DataMember(Name = "act")] public string Act { get; set; }
        [DataMember(Name = "number")] public string Number { get; set; }
        [DataMember(Name = "title")] public string Title { get; set; }
        [DataMember(Name = "code")] public string Code { get; set; }
        [DataMember(Name = "object")] public string ObjectName { get; set; }
        [DataMember(Name = "section")] public string Section { get; set; }
        [DataMember(Name = "org")] public string Org { get; set; }
        [DataMember(Name = "stage")] public string Stage { get; set; }
        [DataMember(Name = "date")] public string Date { get; set; }
        [DataMember(Name = "signers")] public List<Signer> Signers { get; set; }
        [DataMember(Name = "rows")] public List<SheetRow> Rows { get; set; }

        public static SheetJob Parse(string json)
        {
            var ser = new DataContractJsonSerializer(typeof(SheetJob));
            using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                return (SheetJob)ser.ReadObject(ms);
        }
    }

    /// <summary>Загрузка задания с локального сервера Конструктора ИД (https://localhost:3443, свой сертификат).</summary>
    public static class Server
    {
        public static string BaseUrl
        {
            get
            {
                var env = Environment.GetEnvironmentVariable("IDK_URL");
                if (!string.IsNullOrWhiteSpace(env)) return env.TrimEnd('/');
                var port = Environment.GetEnvironmentVariable("IDK_PORT");
                return "https://localhost:" + (string.IsNullOrWhiteSpace(port) ? "3443" : port.Trim());
            }
        }

        public static SheetJob LoadSheet()
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var url = BaseUrl + "/api/acad/sheet";
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = 10000;
            // Сервер Конструктора ИД — на этом же компьютере с собственным сертификатом: доверяем только localhost.
            req.ServerCertificateValidationCallback = (s, cert, chain, errors) =>
                errors == System.Net.Security.SslPolicyErrors.None || req.RequestUri.IsLoopback;
            try
            {
                using (var res = (HttpWebResponse)req.GetResponse())
                using (var rd = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                    return SheetJob.Parse(rd.ReadToEnd());
            }
            catch (WebException e)
            {
                var res = e.Response as HttpWebResponse;
                if (res == null) throw new InvalidOperationException("Сервер Конструктора ИД не отвечает (" + url + "). Запустите Конструктор ИД.");
                using (var rd = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                {
                    var body = rd.ReadToEnd();
                    var i = body.IndexOf("\"error\":\"", StringComparison.Ordinal);
                    var msg = i >= 0 ? body.Substring(i + 9).Split('"')[0] : "Ошибка сервера " + (int)res.StatusCode;
                    throw new InvalidOperationException(msg);
                }
            }
        }
    }
}
